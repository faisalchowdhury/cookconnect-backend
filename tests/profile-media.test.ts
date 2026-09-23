import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
import * as authService from '../src/modules/auth/auth.service';
import * as mediaService from '../src/modules/media/media.service';
import { User } from '../src/modules/user/user.model';
import { CandidateProfile } from '../src/modules/candidate/candidate.model';
import { MediaAsset } from '../src/modules/media/media.model';

const app = createApp();

function createAsset(ownerUserId: Types.ObjectId, kind: string, moderationStatus = 'pending') {
  return MediaAsset.create({
    ownerUserId,
    kind,
    storageKey: `test/${kind}`,
    url: `/uploads/test/${kind}.png`,
    mimeType: kind === 'cv' ? 'application/pdf' : 'image/png',
    sizeBytes: 1,
    moderationStatus,
  });
}

describe('GET /auth/me', () => {
  it('includes the resolved profile photo URL', async () => {
    const email = 'me@example.com';
    const password = 'Password1!';
    await authService.register({ email, password, role: 'candidate', locale: 'fr' });
    await User.updateOne({ email }, { status: 'active', emailVerified: true });
    const user = await User.findOne({ email });

    const photo = await createAsset(user!._id, 'profile-photo', 'approved');
    await CandidateProfile.updateOne({ userId: user!._id }, { photoId: photo._id });

    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.profile.photoUrl).toBe('/uploads/test/profile-photo.png');
  });
});

describe('photo moderation queue', () => {
  it('lists pending candidate photos but not CVs or employer images', async () => {
    const owner = new Types.ObjectId();
    await createAsset(owner, 'profile-photo');
    await createAsset(owner, 'dish-photo');
    await createAsset(owner, 'cv');
    await createAsset(owner, 'logo');

    const kinds = (await mediaService.listPending()).map((a) => a.kind).sort();
    expect(kinds).toEqual(['dish-photo', 'profile-photo']);
  });
});

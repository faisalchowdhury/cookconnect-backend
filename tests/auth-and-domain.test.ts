import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
import { canTransition, JOB_TRANSITION_MAP } from '../src/modules/job/job.lifecycle';
import * as authService from '../src/modules/auth/auth.service';
import { User } from '../src/modules/user/user.model';
import { CandidateProfile } from '../src/modules/candidate/candidate.model';

const app = createApp();

describe('auth', () => {
  it('registers a candidate as pending', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'cook@example.com',
        password: 'Password1!',
        role: 'candidate',
        locale: 'fr',
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);

    const user = await User.findOne({ email: 'cook@example.com' });
    expect(user).toBeTruthy();
    expect(user!.status).toBe('pending');
    expect(user!.emailVerified).toBe(false);
  });

  it('locks account after 3 failed login attempts', async () => {
    await authService.register({
      email: 'lock@example.com',
      password: 'Password1!',
      role: 'candidate',
      locale: 'fr',
    });

    const user = await User.findOne({ email: 'lock@example.com' });
    user!.status = 'active';
    user!.emailVerified = true;
    await user!.save();

    for (let i = 0; i < 3; i += 1) {
      const fail = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'lock@example.com', password: 'WrongPass1!' });
      expect([401, 423]).toContain(fail.status);
    }

    const locked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lock@example.com', password: 'Password1!' });
    expect(locked.status).toBe(423);
  });
});

describe('job lifecycle', () => {
  it('allows documented transitions only', () => {
    expect(canTransition('draft', 'submit')).toBe(true);
    expect(canTransition('pending', 'approve')).toBe(true);
    expect(canTransition('pending', 'reject')).toBe(true);
    expect(canTransition('active', 'close')).toBe(true);
    expect(canTransition('active', 'expire')).toBe(true);
    expect(canTransition('expired', 'republish')).toBe(true);
    expect(canTransition('active', 'submit')).toBe(false);
    expect(Object.keys(JOB_TRANSITION_MAP).length).toBeGreaterThan(0);
  });
});

describe('profile completion', () => {
  it('computes 100% when all required fields are set', async () => {
    const profile = await CandidateProfile.create({
      userId: new Types.ObjectId(),
      firstName: 'A',
      lastName: 'B',
      phone: '0612345678',
      city: 'casablanca',
      sectorId: 'kitchen',
      positionId: 'head-chef',
      experience: '1-3',
      availability: 'immediate',
      photoId: new Types.ObjectId(),
      about: { fr: 'Profil', en: 'Profile', ar: 'ملف' },
    });
    expect(profile.completionPercent).toBe(100);
  });
});

import { MAX_LOGIN_ATTEMPTS, LOCK_DURATION_MS } from './user.constant';
import { CreateUserInput, IUserDocument, UpdateUserInput } from './user.interface';
import { User } from './user.model';

export async function findById(id: string): Promise<IUserDocument | null> {
  return User.findById(id);
}

export async function findByEmail(
  email: string,
  includePassword = false,
): Promise<IUserDocument | null> {
  const query = User.findOne({ email: email.toLowerCase().trim() });
  if (includePassword) {
    query.select('+passwordHash');
  }
  return query;
}

export async function createUser(input: CreateUserInput): Promise<IUserDocument> {
  return User.create({
    ...input,
    email: input.email.toLowerCase().trim(),
  });
}

export async function updateUser(
  id: string,
  data: UpdateUserInput,
): Promise<IUserDocument | null> {
  return User.findByIdAndUpdate(id, data, { new: true });
}

export async function softDeleteUser(id: string): Promise<IUserDocument | null> {
  const user = await User.findById(id);
  if (!user) return null;
  user.status = 'deleted';
  return user.softDelete();
}

export async function incrementFailedLogin(id: string): Promise<IUserDocument | null> {
  const user = await User.findByIdAndUpdate(
    id,
    { $inc: { failedLoginAttempts: 1 } },
    { new: true },
  );
  if (user && user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
    return lockAccount(id);
  }
  return user;
}

export async function resetFailedLogin(id: string): Promise<IUserDocument | null> {
  return User.findByIdAndUpdate(
    id,
    { failedLoginAttempts: 0, lockedUntil: null },
    { new: true },
  );
}

export async function lockAccount(id: string): Promise<IUserDocument | null> {
  return User.findByIdAndUpdate(
    id,
    {
      lockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
      failedLoginAttempts: MAX_LOGIN_ATTEMPTS,
    },
    { new: true },
  );
}

export async function setEmailVerified(id: string): Promise<IUserDocument | null> {
  const user = await User.findById(id);
  if (!user) return null;
  user.emailVerified = true;
  // Verifying an email activates a new account; it must not lift a suspension.
  if (user.status === 'pending') user.status = 'active';
  return user.save();
}

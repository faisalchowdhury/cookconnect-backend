import { Document, Types } from 'mongoose';
import {
  AdminLevel,
  AuthProvider,
  Locale,
  UserRole,
  UserStatus,
} from './user.constant';

export interface IUser {
  email: string;
  passwordHash?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  phone?: string;
  locale: Locale;
  authProvider: AuthProvider;
  providerId?: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt?: Date;
  adminLevel?: AdminLevel | null;
  permissions: string[];
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  _id: Types.ObjectId;
  softDelete(): Promise<IUserDocument>;
}

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  locale?: Locale;
  authProvider?: AuthProvider;
  providerId?: string;
  status?: UserStatus;
  emailVerified?: boolean;
};

export type UpdateUserInput = Partial<
  Pick<
    IUser,
    | 'phone'
    | 'locale'
    | 'status'
    | 'emailVerified'
    | 'lastLoginAt'
    | 'adminLevel'
    | 'permissions'
    | 'passwordHash'
    | 'failedLoginAttempts'
    | 'lockedUntil'
  >
>;

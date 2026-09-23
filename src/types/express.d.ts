import 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      role: 'candidate' | 'employer' | 'admin';
      permissions: string[];
      adminLevel?: 'super' | 'sub' | null;
      email?: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};

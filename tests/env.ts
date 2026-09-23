process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cookconnect-test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret-min-32-characters!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-min-32-characters!';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001';
process.env.MAIL_DRIVER = 'console';
process.env.STORAGE_DRIVER = 'local';
process.env.COOKIE_SECURE = 'false';
process.env.UPLOAD_DIR = './uploads-test';
// Every request comes from one IP in tests; the global limiter would start answering 429 mid-suite.
process.env.RATE_LIMIT_MAX = '1000000';

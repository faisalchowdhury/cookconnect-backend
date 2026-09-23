export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorSources: Array<{ path: string; message: string }>;

  constructor(
    statusCode: number,
    message: string,
    errorSources: Array<{ path: string; message: string }> = [],
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorSources = errorSources;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

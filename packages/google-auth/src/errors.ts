export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }

  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
  get isRateLimited(): boolean {
    return this.status === 429;
  }
  get isTransient(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

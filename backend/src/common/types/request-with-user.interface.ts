export interface RequestWithUser {
  user: {
    sub: number;
    username: string;
    name: string;
    role: string;
  };
}

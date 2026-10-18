import jwt from 'jsonwebtoken';

// The login "ticket". It holds the person's id and a counter. If the counter in the database goes up, every old ticket stops working.
export const signToken = (user, days = 7) =>
  jwt.sign({ sub: user.id, tv: user.tokenVersion }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: `${days}d` });

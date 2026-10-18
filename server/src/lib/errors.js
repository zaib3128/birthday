// An error that carries a status code and a message that is safe to show to the person.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}
// Express 4 does not catch errors from async handlers, so this passes them on.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Something is wrong with how the server was set up (a missing setting, no database). The message is written for the owner.
export class SetupError extends Error {}

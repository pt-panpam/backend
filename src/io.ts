import { Server } from 'socket.io';

let _io: Server | null = null;

export function getIO(): Server | null {
  return _io;
}

export function setIO(io: Server): void {
  _io = io;
}

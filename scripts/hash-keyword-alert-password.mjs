import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { emitKeypressEvents } from 'node:readline';

const iterations = 100_000;
const salt = randomBytes(16);
const input = process.stdin;
if (!input.isTTY || typeof input.setRawMode !== 'function') {
  throw new Error('Run this script in an interactive terminal.');
}

emitKeypressEvents(input);
input.setRawMode(true);
input.resume();
process.stderr.write('Enter the alert-management password: ');

let password = '';
input.on('keypress', (character, key) => {
  if (key?.ctrl && key.name === 'c') {
    input.setRawMode(false);
    process.exit(130);
  }
  if (key?.name === 'return' || key?.name === 'enter') {
    input.setRawMode(false);
    input.pause();
    process.stderr.write('\n');
    const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    process.stdout.write(
      `pbkdf2-sha256$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}\n`,
    );
    return;
  }
  if (key?.name === 'backspace') {
    password = password.slice(0, -1);
  } else if (character && !key?.ctrl && !key?.meta) {
    password += character;
  }
});

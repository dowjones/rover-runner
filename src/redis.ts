import { window } from 'vscode';
import detect from 'detect-port';

export const startRedis = () => {
  detect(6379).then((_port: number) => {
    // _port is the next available port so if equal then server isn't running
    if (6379 === _port) {
      const redisTerminal =
        window.terminals.find((i: { name: string }) => i.name === `Redis`) || window.createTerminal(`Redis`);
      redisTerminal.sendText('redis-server');
    }
  });
};

export const stopRedis = () => {
  const redisTerminal = window.terminals.find((i: { name: string }) => i.name === `Redis`);
  if (redisTerminal) {
    redisTerminal.sendText('\u0003');
    redisTerminal.dispose();
  }
};

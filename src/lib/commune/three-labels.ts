/** Hand-drawn style labels on the 2D overlay canvas (pure — no renderer state). */

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  small = false,
  superAdmin = false
): void {
  const maxChars = small ? 30 : 28;
  const label = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
  ctx.font = `bold ${small ? 10 : 12}px 'Schoolbell', ui-monospace, monospace`;
  const width = Math.min(small ? 188 : 194, Math.ceil(ctx.measureText(label).width) + 16);
  const height = small ? 17 : 21;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height);
  ctx.fillStyle = superAdmin ? 'rgba(72, 51, 19, 0.58)' : 'rgba(36, 28, 19, 0.42)';
  ctx.fillRect(left + 2, top + 3, width, height);
  ctx.fillStyle = superAdmin ? '#a77a2f' : '#785a3c';
  ctx.fillRect(left, top, width, height);
  ctx.fillStyle = superAdmin ? '#f3d87c' : '#f0dfb9';
  ctx.fillRect(left + 2, top + 2, width - 4, height - 4);
  ctx.fillStyle = superAdmin ? '#3b2d13' : '#493927';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, Math.round(x), top + height / 2, width - 10);
}

export function drawHangoutLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  title: string,
  occupants: readonly string[],
  capacity: number,
): void {
  const lines = [`${title} · ${occupants.length}/${capacity}`, ...(occupants.length ? occupants : ['E · ENTER TO CHILL'])];
  ctx.font = "bold 10px 'Schoolbell', ui-monospace, monospace";
  const width = Math.min(232, Math.max(118, ...lines.map((line) => Math.ceil(ctx.measureText(line).width) + 16)));
  const height = lines.length * 14 + 6;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height);
  ctx.fillStyle = 'rgba(36, 28, 19, 0.72)';
  ctx.fillRect(left + 2, top + 3, width, height);
  ctx.fillStyle = '#785a3c';
  ctx.fillRect(left, top, width, height);
  ctx.fillStyle = '#f0dfb9';
  ctx.fillRect(left + 2, top + 2, width - 4, height - 4);
  ctx.fillStyle = '#493927';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => {
    ctx.fillText(line, Math.round(x), top + 8 + index * 14, width - 10);
  });
}

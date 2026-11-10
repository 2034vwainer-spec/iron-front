function drawBus(ctx, x, y, width, height, time) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 0.002) * 5);

  // Corpo do transporte militar
  ctx.fillStyle = "#455344";
  ctx.beginPath();
  ctx.moveTo(-width * 0.5, height * 0.15);
  ctx.lineTo(-width * 0.4, -height * 0.25);
  ctx.lineTo(width * 0.32, -height * 0.25);
  ctx.lineTo(width * 0.5, height * 0.05);
  ctx.lineTo(width * 0.5, height * 0.2);
  ctx.lineTo(-width * 0.5, height * 0.2);
  ctx.closePath();
  ctx.fill();

  // Janelas
  ctx.fillStyle = "#182a2c";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(-width * 0.34 + i * width * 0.14,
      -height * 0.17, width * 0.1, height * 0.13);
  }

  // Faixa militar
  ctx.fillStyle = "#26372a";
  ctx.fillRect(-width * 0.45, height * 0.05, width * 0.9, height * 0.07);

  // Asas
  ctx.fillStyle = "#53634c";
  ctx.beginPath();
  ctx.moveTo(-width * 0.15, 0);
  ctx.lineTo(-width * 0.8, height * 0.5);
  ctx.lineTo(width * 0.65, height * 0.5);
  ctx.lineTo(width * 0.2, 0);
  ctx.fill();

  // Cauda
  ctx.fillRect(-width * 0.08, -height * 0.42, width * 0.16, height * 0.3);

  // Luzes
  ctx.fillStyle = "#e0bd65";
  ctx.fillRect(width * 0.43, height * 0.04, 7, 5);

  ctx.restore();
}



2. Inimigos com aparência mais realista

function drawRealisticEnemy(ctx, x, y, size, boss = false) {
  ctx.save();
  ctx.translate(x, y);

  // Sombra
  ctx.fillStyle = "#080d0b88";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.48, size * 0.32, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Botas
  ctx.fillStyle = "#171d19";
  ctx.fillRect(-size * 0.2, size * 0.27, size * 0.16, size * 0.2);
  ctx.fillRect(size * 0.04, size * 0.27, size * 0.16, size * 0.2);

  // Uniforme
  ctx.fillStyle = boss ? "#353b2d" : "#46513c";
  ctx.fillRect(-size * 0.25, -size * 0.03, size * 0.5, size * 0.36);

  // Colete
  ctx.fillStyle = "#252e27";
  ctx.fillRect(-size * 0.22, size * 0.02, size * 0.44, size * 0.23)

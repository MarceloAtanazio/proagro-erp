# Propósito: gera os logos BRANCOS com fundo transparente do menu lateral do visual novo, a partir de imagens do logo em verde.
#   O contorno do logo vira branco; a transparência vem do próprio PNG (se houver) ou da "distância do branco" de cada pixel (JPG/PNG sobre fundo branco), com suavização
#   nas bordas. Recorta rente ao desenho e redimensiona.
# Entradas: -Simbolo (só o símbolo, ex.: o JPG enviado pelo Marcelo), -Completo (símbolo + "PROAGRO SEGUROS", ex.: public/logo-white.png), -Saida (pasta, ex.: public).
# Saídas: <Saida>/logo-simbolo-branco.png (320 px de largura) e <Saida>/logo-completo-branco.png (560 px).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/2026-11-12_gera_logos_brancos.ps1 -Simbolo <jpg> -Completo public/logo-white.png -Saida public
param([Parameter(Mandatory = $true)][string]$Simbolo, [Parameter(Mandatory = $true)][string]$Completo, [Parameter(Mandatory = $true)][string]$Saida)
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class LogoBranco {
  public static string Gerar(string src, string dst, int largura) {
    using (var bmp = new Bitmap(src)) {
      int w = bmp.Width, h = bmp.Height;
      var d = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      int stride = d.Stride; var px = new byte[stride * h];
      System.Runtime.InteropServices.Marshal.Copy(d.Scan0, px, 0, px.Length); bmp.UnlockBits(d);
      bool temAlfa = false;
      for (int i = 3; i < px.Length; i += 4) if (px[i] < 250) { temAlfa = true; break; }
      var al = new byte[w * h]; int minX = w, minY = h, maxX = -1, maxY = -1;
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * stride + x * 4; double a;
        if (temAlfa) a = px[i + 3] / 255.0;
        else { int mn = Math.Min(px[i], Math.Min(px[i + 1], px[i + 2])); a = (255.0 - mn) / 215.0; if (a > 1) a = 1; if (a < 0.06) a = 0; }
        byte v = (byte)Math.Round(a * 255); al[y * w + x] = v;
        if (v > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      if (maxX < 0) throw new Exception("Nenhum desenho encontrado em " + src);
      int pad = (int)(Math.Max(w, h) * 0.008);
      minX = Math.Max(0, minX - pad); minY = Math.Max(0, minY - pad); maxX = Math.Min(w - 1, maxX + pad); maxY = Math.Min(h - 1, maxY + pad);
      int cw = maxX - minX + 1, ch = maxY - minY + 1;
      using (var corte = new Bitmap(cw, ch, PixelFormat.Format32bppArgb)) {
        var cd = corte.LockBits(new Rectangle(0, 0, cw, ch), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        var saida = new byte[cd.Stride * ch];
        for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
          int o = y * cd.Stride + x * 4; saida[o] = 255; saida[o + 1] = 255; saida[o + 2] = 255; saida[o + 3] = al[(y + minY) * w + (x + minX)];
        }
        System.Runtime.InteropServices.Marshal.Copy(saida, 0, cd.Scan0, saida.Length); corte.UnlockBits(cd);
        int nw = largura, nh = (int)Math.Round(ch * (double)largura / cw);
        using (var fim = new Bitmap(nw, nh, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(fim)) {
          g.Clear(Color.Transparent); g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.SmoothingMode = SmoothingMode.HighQuality; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
          g.DrawImage(corte, new Rectangle(0, 0, nw, nh), 0, 0, cw, ch, GraphicsUnit.Pixel);
          fim.Save(dst, ImageFormat.Png);
        }
        return nw + "x" + nh + " (origem " + w + "x" + h + ", recorte " + cw + "x" + ch + ", " + (temAlfa ? "com transparência" : "sobre fundo claro") + ")";
      }
    }
  }
}
'@
$Saida = (Resolve-Path $Saida).Path
"símbolo : " + [LogoBranco]::Gerar((Resolve-Path $Simbolo).Path, (Join-Path $Saida 'logo-simbolo-branco.png'), 320)
"completo: " + [LogoBranco]::Gerar((Resolve-Path $Completo).Path, (Join-Path $Saida 'logo-completo-branco.png'), 560)

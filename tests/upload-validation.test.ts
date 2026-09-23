import sharp from 'sharp';
import { validateCvBuffer, validateImageBuffer } from '../src/middlewares/upload';

function image(format: 'png' | 'jpeg' | 'gif', width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#cc6633' } })
    .toFormat(format)
    .toBuffer();
}

describe('upload validation', () => {
  it('rejects a CV whose bytes are not a PDF, DOC or DOCX, whatever MIME type it claims', () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect(() => validateCvBuffer(html, 'application/pdf')).toThrow(
      'CV must be a PDF, DOC, or DOCX file',
    );
    expect(() => validateCvBuffer(Buffer.from('%PDF-1.7\n'), 'text/plain')).not.toThrow();
  });

  it('rejects images whose decoded format is not JPEG, PNG or WebP', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800"/></svg>',
    );
    await expect(validateImageBuffer(svg)).rejects.toThrow('Image must be JPEG, PNG, or WebP');
    await expect(validateImageBuffer(await image('gif', 800, 800))).rejects.toThrow(
      'Image must be JPEG, PNG, or WebP',
    );
    await expect(validateImageBuffer(await image('png', 800, 800))).resolves.toEqual({
      width: 800,
      height: 800,
    });
  });

  it('applies a per-call minimum size', async () => {
    const banner = await image('jpeg', 1600, 400);
    await expect(validateImageBuffer(banner)).rejects.toThrow('at least 600×600');
    await expect(
      validateImageBuffer(banner, { minWidth: 1200, minHeight: 300 }),
    ).resolves.toEqual({ width: 1600, height: 400 });
  });
});

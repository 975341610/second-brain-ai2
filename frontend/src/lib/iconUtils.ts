const DEFAULT_NOTE_ICON = '📝';
const DEFAULT_NOTEBOOK_ICON = '📒';

export function defaultIconFor(kind: 'note' | 'notebook') {
  return kind === 'note' ? DEFAULT_NOTE_ICON : DEFAULT_NOTEBOOK_ICON;
}

export function isDataIcon(value: string | undefined | null): boolean {
  return Boolean(value && value.startsWith('data:image/'));
}

export function validateIconFile(file: File): Promise<{ ok: boolean; dataUrl?: string; message?: string }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve({ ok: false, message: '只能导入图片图标。' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const image = new Image();
      image.onload = () => {
        const { width, height } = image;
        const isSquare = Math.abs(width - height) <= 8;
        const sizeOk = width >= 48 && height >= 48 && width <= 512 && height <= 512;
        if (!isSquare || !sizeOk) {
          resolve({ ok: false, message: '图标需为接近正方形，且尺寸在 48~512 像素之间。' });
          return;
        }
        resolve({ ok: true, dataUrl });
      };
      image.onerror = () => resolve({ ok: false, message: '图标文件无法读取，请更换图片。' });
      image.src = dataUrl;
    };
    reader.onerror = () => resolve({ ok: false, message: '图标文件读取失败，请重试。' });
    reader.readAsDataURL(file);
  });
}

export function validateExistingDataIcon(icon: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isDataIcon(icon)) {
      resolve(true);
      return;
    }
    const image = new Image();
    image.onload = () => {
      const { width, height } = image;
      const isSquare = Math.abs(width - height) <= 8;
      const sizeOk = width >= 48 && height >= 48 && width <= 512 && height <= 512;
      resolve(isSquare && sizeOk);
    };
    image.onerror = () => resolve(false);
    image.src = icon;
  });
}

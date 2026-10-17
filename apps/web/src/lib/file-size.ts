const sizeFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "0,4 KB", "850 KB", "12,3 MB": one wording for every file size the app shows. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${sizeFormat.format(Math.max(bytes / 1024, 0.1))} KB`;
  }
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

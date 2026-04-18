import { ScanRecord } from '@/components/HistoryView';

// Формат TXT — каждый код на новой строке, читается 1С 8.2 через ПрочитатьТекст()
export function exportTXT(records: ScanRecord[]): void {
  const lines = records.map(r => r.code);
  download(lines.join('\r\n'), `scan_${dateStr()}.txt`, 'text/plain;charset=utf-8');
}

// Формат CSV — код + дата + время, легко загрузить через ЗагрузкаДанныхИзТабличногоДокумента
export function exportCSV(records: ScanRecord[]): void {
  const header = 'Штрихкод;Дата;Время;Количество';
  const lines = records.map(r => {
    const d = r.timestamp;
    const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${r.code};${date};${time};1`;
  });
  download([header, ...lines].join('\r\n'), `scan_${dateStr()}.csv`, 'text/csv;charset=utf-8');
}

// Формат MXL-подобный TSV — совместим с буфером обмена 1С
export function exportTSV(records: ScanRecord[]): void {
  const header = 'Штрихкод\tКоличество\tДата';
  const lines = records.map(r => {
    const d = r.timestamp;
    const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    return `${r.code}\t1\t${date}`;
  });
  download([header, ...lines].join('\r\n'), `scan_${dateStr()}.tsv`, 'text/tab-separated-values;charset=utf-8');
}

function download(content: string, filename: string, mime: string) {
  const bom = '\uFEFF'; // BOM для корректной кириллицы в Excel / 1С
  const blob = new Blob([bom + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

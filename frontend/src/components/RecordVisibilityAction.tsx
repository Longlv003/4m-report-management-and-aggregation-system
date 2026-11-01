import { useState } from 'react';
import { setRecordExcluded } from '../api.js';

interface Props {
  report: 'scan4m' | 'cvr4m'; id: string; label: string; excluded: boolean; onChanged: () => void;
}
export function RecordVisibilityAction({ report,id,label,excluded,onChanged }: Props) {
  const [open,setOpen] = useState(false);
  const [reason,setReason] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await setRecordExcluded(report,id,!excluded,reason);
      setOpen(false); setReason(''); onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : 'Không thể lưu thay đổi'); }
    finally { setBusy(false); }
  };
  return <>
    <button className="btn btn-outline" onClick={() => { setError(''); setOpen(true); }}>
      {excluded ? 'Khôi phục' : 'Loại bỏ'}
    </button>
    {open && <div className="modal-overlay"><form className="modal-card" role="dialog" aria-modal="true"
      aria-label={excluded ? 'Khôi phục bản ghi' : 'Loại bỏ bản ghi'} onSubmit={submit}>
      <div className="modal-header"><h3>{excluded ? 'Khôi phục bản ghi' : 'Loại bỏ bản ghi'}</h3></div>
      <div className="modal-body" style={{ whiteSpace: 'normal',textAlign: 'left' }}>
        <p><strong>{label}</strong></p>
        <p>{excluded ? 'Bản ghi sẽ xuất hiện lại trong bảng, thống kê và Excel.' :
          'Bản ghi sẽ được ẩn khỏi bảng, thống kê và Excel. Quét lại file sẽ không tự khôi phục dòng này.'}</p>
        <label>Lý do {excluded ? '(không bắt buộc)' : '(bắt buộc)'}
          <textarea className="filter-input" style={{ display: 'block',width: '100%',height: 90,marginTop: 10 }}
            value={reason} maxLength={1000} required={!excluded} onChange={event => setReason(event.target.value)} />
        </label>
        {error && <div className="alert-error">{error}</div>}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setOpen(false)}>Hủy</button>
        <button type="submit" className="btn btn-primary" disabled={busy || (!excluded && !reason.trim())}>
          {busy ? 'Đang lưu...' : excluded ? 'Khôi phục' : 'Xác nhận loại bỏ'}
        </button>
      </div>
    </form></div>}
  </>;
}

export interface ItemSearchValues { itemName: string; itemCode: string; lotNo: string }

export function ItemSearchFilters({ value, onChange }: {
  value: ItemSearchValues;
  onChange: (value: ItemSearchValues) => void;
}) {
  const prefix = useId();
  return <>{([['itemName', 'Item name'], ['itemCode', 'Item code'], ['lotNo', 'Lot no']] as const).map(([key, label]) => (
    <div className="filter-group" key={key}>
      <label className="filter-label" htmlFor={`${prefix}-${key}`}>{label}</label>
      <input id={`${prefix}-${key}`} type="text" className="filter-input" placeholder={label}
        style={key === 'itemName' || key === 'lotNo' ? { width: 100 } : undefined}
        value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })} />
    </div>
  ))}</>;
}
import { useId } from 'react';

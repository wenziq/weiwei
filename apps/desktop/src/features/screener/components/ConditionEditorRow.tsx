import { Trash2 } from 'lucide-react';
import type { ScreenerCondition, Sector } from '@weiwei/contracts';
import { SectorPicker } from './SectorPicker';

export const fieldLabels: Record<ScreenerCondition['field'], string> = { roe: 'ROE（最新报告期）', dividend: '股息率（近一年）', cap: '总市值', net: '净利率（最新报告期）', debt: '资产负债率', industry: '行业', concept: '概念（真实成分）', price: '最新价', changePct: '今日涨跌幅', amount: '今日成交额', turnover: '换手率' };
export const operatorLabels: Record<ScreenerCondition['operator'], string> = { gte: '大于或等于', lte: '小于或等于', between: '介于', include: '属于', exclude: '不属于' };
const numericFields = ['roe', 'dividend', 'cap', 'net', 'debt', 'price', 'changePct', 'amount', 'turnover'];
const fields = Object.entries(fieldLabels) as [ScreenerCondition['field'], string][];

export function conditionText(condition: ScreenerCondition) {
  const suffix = ['roe', 'dividend', 'net', 'debt'].includes(condition.field) ? '%' : condition.field === 'cap' ? ' 亿元' : '';
  return `${fieldLabels[condition.field]} ${operatorLabels[condition.operator]} ${Array.isArray(condition.value) ? condition.value.join(' 至 ') : condition.value}${suffix}`;
}

export function ConditionEditorRow({ condition, sectors, onChange, onRemove }: { condition: ScreenerCondition; sectors: Sector[]; onChange: (condition: ScreenerCondition) => void; onRemove: () => void }) {
  const categorical = condition.field === 'industry' || condition.field === 'concept';
  const options = sectors.filter(item => item.type === (condition.field === 'industry' ? '行业' : '概念')).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const updateField = (field: ScreenerCondition['field']) => onChange({ field, operator: numericFields.includes(field) ? 'gte' : 'include', value: numericFields.includes(field) ? 10 : '' });
  const updateValue = (value: string, end?: string) => onChange({ ...condition, value: end === undefined ? categorical ? value : Number(value) : [Number(value), Number(end)] });
  return <div className="condition-edit-row">
    <label>指标或分类<select aria-label="条件字段" value={condition.field} onChange={event => updateField(event.target.value as ScreenerCondition['field'])}>{fields.map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select></label>
    <label>比较方式<select aria-label="比较方式" value={condition.operator} onChange={event => { const operator = event.target.value as ScreenerCondition['operator']; onChange({ ...condition, operator, value: operator === 'between' ? [10, 20] : categorical ? '' : 10 }); }}>{(categorical ? ['include', 'exclude'] as const : ['gte', 'lte', 'between'] as const).map(operator => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}</select></label>
    <label className="condition-value-field">{condition.field === 'cap' ? '市值（亿元）' : condition.field === 'amount' ? '成交额（亿元）' : condition.field === 'price' ? '最新价（各市场原币）' : categorical ? '从真实板块目录中选择' : '百分比（%）'}<div className="condition-value-fields">{categorical ? <SectorPicker options={options} value={String(condition.value)} kind={condition.field === 'industry' ? '行业' : '概念'} onChange={updateValue} /> : condition.operator === 'between' ? <><input aria-label="区间最小值" type="number" step="any" value={Array.isArray(condition.value) ? condition.value[0] : ''} onChange={event => updateValue(event.target.value, Array.isArray(condition.value) ? String(condition.value[1]) : '')} /><span>至</span><input aria-label="区间最大值" type="number" step="any" value={Array.isArray(condition.value) ? condition.value[1] : ''} onChange={event => updateValue(Array.isArray(condition.value) ? String(condition.value[0]) : '', event.target.value)} /></> : <input aria-label="条件数值" type="number" step="any" value={typeof condition.value === 'number' ? condition.value : ''} onChange={event => updateValue(event.target.value)} />}</div></label>
    <button className="icon-button" aria-label="删除条件" title="删除条件" onClick={onRemove}><Trash2 size={16} /></button>
  </div>;
}

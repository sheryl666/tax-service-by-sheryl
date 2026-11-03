import { useEffect, useState } from 'react';
import { callFunction } from '../lib/cloudbase.js';
import { formatDateTime } from '../lib/format.js';
import { getToken } from '../lib/session.js';

const SERVICE_LABELS = { annual: '工商年报', tax: '税务申报', invoice: '发票异常', license: '执照代办' };
const PACKAGE_LABELS = { basic: '基础套餐', plus: '升级套餐', full: '至尊套餐' };
const EMPTY_FORM = {
  productId: '', name: '', serviceType: 'annual', packageKey: 'basic',
  priceYuan: '', description: '', status: 'inactive', isTestPrice: false
};

function centsToYuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function yuanToCents(value) {
  const normalized = String(value).trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [yuan, fraction = ''] = normalized.split('.');
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    callFunction('getProducts', { token: getToken() })
      .then((result) => { if (!cancelled) setProducts(result.list || []); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || '套餐加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function editProduct(product) {
    setForm({
      productId: product._id,
      name: product.name || '',
      serviceType: product.service_type,
      packageKey: product.package_key,
      priceYuan: centsToYuan(product.price_cents),
      description: product.description || '',
      status: product.status,
      isTestPrice: Boolean(product.is_test_price)
    });
    setError('');
    setMessage('正在编辑该套餐；改价只影响之后新建的订单');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(event) {
    event.preventDefault();
    const priceCents = yuanToCents(form.priceYuan);
    if (priceCents == null) {
      setError('请输入正确价格，最多保留两位小数且必须大于 0');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await callFunction('saveProduct', {
        token: getToken(),
        productId: form.productId || undefined,
        name: form.name.trim(),
        serviceType: form.serviceType,
        packageKey: form.packageKey,
        priceCents,
        description: form.description.trim(),
        status: form.status,
        isTestPrice: form.isTestPrice
      });
      setForm(EMPTY_FORM);
      setMessage('套餐已保存，小程序将读取最新上架配置');
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message || '套餐保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">商品配置</p>
          <h2>服务套餐</h2>
          <p className="muted">统一维护小程序可购买项目和服务端可信价格</p>
        </div>
      </section>

      <div className="product-page-grid">
        <form className="detail-card product-form" onSubmit={save}>
          <div className="form-title-row">
            <h3>{form.productId ? '编辑套餐' : '新增套餐'}</h3>
            {form.productId && <button className="text-button" type="button" onClick={() => setForm(EMPTY_FORM)}>取消编辑</button>}
          </div>
          <label><span>套餐名称</span><input value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="如 工商年报基础套餐" required /></label>
          <div className="form-two-columns">
            <label><span>服务类型</span><select value={form.serviceType} onChange={(event) => updateField('serviceType', event.target.value)}>{Object.entries(SERVICE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>套餐类型</span><select value={form.packageKey} onChange={(event) => updateField('packageKey', event.target.value)}>{Object.entries(PACKAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label><span>售价（元）</span><input inputMode="decimal" value={form.priceYuan} onChange={(event) => updateField('priceYuan', event.target.value)} placeholder="如 299.00" required /></label>
          <label><span>套餐说明</span><textarea rows="4" value={form.description} onChange={(event) => updateField('description', event.target.value)} placeholder="用户在小程序中看到的服务说明" /></label>
          <div className="form-two-columns">
            <label><span>状态</span><select value={form.status} onChange={(event) => updateField('status', event.target.value)}><option value="active">上架</option><option value="inactive">下架</option></select></label>
            <label className="checkbox-label"><input type="checkbox" checked={form.isTestPrice} onChange={(event) => updateField('isTestPrice', event.target.checked)} /><span>标记为测试价</span></label>
          </div>
          <p className="form-hint">金额以“分”存入数据库。小程序只能提交套餐 ID，实际支付金额由云函数读取。</p>
          {(error || message) && <div className={`inline-notice ${error ? 'state-error' : ''}`}>{error || message}</div>}
          <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? '保存中…' : '保存套餐'}</button>
        </form>

        <section className="table-card product-list-card">
          {loading ? <div className="state-message">正在加载套餐…</div> : products.length === 0 ? <div className="state-message"><p>暂无套餐，请先创建一个工商年报套餐</p></div> : (
            <table>
              <thead><tr><th>套餐</th><th>项目</th><th>售价</th><th>状态</th><th>更新时间</th><th /></tr></thead>
              <tbody>{products.map((product) => (
                <tr key={product._id} className="non-clickable-row">
                  <td><strong>{product.name}</strong><span className="cell-subtitle">{PACKAGE_LABELS[product.package_key]}</span></td>
                  <td>{SERVICE_LABELS[product.service_type]}</td>
                  <td><strong>¥{centsToYuan(product.price_cents)}</strong>{product.is_test_price && <span className="test-price-chip">测试价</span>}</td>
                  <td><span className={`account-status ${product.status === 'active' ? 'active' : 'disabled'}`}>{product.status === 'active' ? '已上架' : '已下架'}</span></td>
                  <td>{formatDateTime(product.updated_at)}</td>
                  <td><button className="button button-secondary" type="button" onClick={() => editProduct(product)}>编辑</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

import { useState } from 'react';
import { nf, rp } from '../../../utils/formatters';
import {
  POS_PRODUCTS,
  addLog,
  cartTotal,
  coldStock,
  consumeCold,
  posPrice,
} from '../../../utils/erpHelpers';

// Tab 1: Kasir (buka shift, pilih produk, bayar)
export default function KasirPos({ data, setData, user }) {
  const [openCash, setOpenCash] = useState('300000');
  const [recv, setRecv] = useState('');
  const [msg, setMsg] = useState(null); // { text, kind }
  const { pos } = data;

  const updatePos = (change) => setData((d) => ({ ...d, pos: { ...d.pos, ...change(d.pos) } }));

  const openShift = () => {
    const cash = Number(openCash);
    if (cash < 0) return;
    setData((d) =>
      addLog(
        { ...d, pos: { ...d.pos, shift: { open: cash }, sales: [] } },
        'kas',
        `Shift dibuka dengan modal ${rp(cash)}`,
        user.name
      )
    );
  };

  if (!pos.shift) {
    return (
      <div className="panel" style={{ maxWidth: 460 }}>
        <h2>Buka shift dulu</h2>
        <p className="muted">Transaksi baru bisa dicatat setelah modal awal kasir diisi.</p>
        <div className="field">
          <label htmlFor="openCash">Modal awal kasir (Rp)</label>
          <input
            id="openCash"
            type="number"
            min="0"
            value={openCash}
            onChange={(e) => setOpenCash(e.target.value)}
          />
        </div>
        <button type="button" className="btn primary" onClick={openShift}>
          Buka shift
        </button>
      </div>
    );
  }

  const total = cartTotal(data);
  const items = Object.entries(pos.cart);
  const coldNeed = items.reduce(
    (a, [id, q]) => a + POS_PRODUCTS.find((p) => p.id === id).cold * q,
    0
  );
  const cold = coldStock(data);
  const received = Number(recv);

  const add = (id) => {
    updatePos((p) => ({ cart: { ...p.cart, [id]: (p.cart[id] || 0) + 1 } }));
    setMsg(null);
  };
  const dec = (id) =>
    updatePos((p) => {
      const cart = { ...p.cart, [id]: p.cart[id] - 1 };
      if (cart[id] <= 0) delete cart[id];
      return { cart };
    });
  const clear = () => {
    updatePos(() => ({ cart: {} }));
    setRecv('');
  };
  const choosePay = (pay) => {
    updatePos(() => ({ pay }));
    setMsg(null);
  };

  const checkout = () => {
    if (coldNeed > cold) {
      return setMsg({
        kind: 'bad',
        text: `Cold storage hanya ${cold} butir, pesanan butuh ${coldNeed}.`,
      });
    }
    if (pos.pay === 'tunai' && !(received >= total)) {
      return setMsg({ kind: 'bad', text: 'Uang diterima kurang dari total.' });
    }
    const units = items.reduce(
      (a, [id, q]) => a + (POS_PRODUCTS.find((p) => p.id === id).cold || 1) * q,
      0
    );
    setData((d) =>
      addLog(
        {
          ...d,
          batches: consumeCold(d.batches, coldNeed),
          pos: {
            ...d.pos,
            sales: [...d.pos.sales, { total, pay: d.pos.pay }],
            revenue: d.pos.revenue + total,
            units: d.pos.units + units,
            cart: {},
          },
        },
        'pos',
        `Penjualan kasir ${rp(total)} (${pos.pay})`,
        user.name
      )
    );
    setRecv('');
    setMsg({ kind: 'good', text: 'Pembayaran tercatat. Struk siap dicetak.' });
  };

  return (
    <div className="pos">
      <div>
        <div className="tiles">
          {POS_PRODUCTS.map((p) => (
            <button key={p.id} type="button" className="tile" onClick={() => add(p.id)}>
              <b>{p.name}</b>
              <span className="muted small">{p.note}</span>
              <span className="pr num">{rp(posPrice(data, p))}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel flat stack" style={{ gap: 10 }}>
        <h2>Pesanan</h2>
        {items.length ? (
          <ul className="cart">
            {items.map(([id, q]) => {
              const p = POS_PRODUCTS.find((x) => x.id === id);
              return (
                <li key={id}>
                  <span>
                    {p.name}
                    <br />
                    <span className="muted small num">{rp(posPrice(data, p))}</span>
                  </span>
                  <span className="qty">
                    <button type="button" aria-label="Kurangi" onClick={() => dec(id)}>
                      −
                    </button>
                    <b className="num">{q}</b>
                    <button type="button" aria-label="Tambah" onClick={() => add(id)}>
                      +
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">Ketuk produk untuk menambah pesanan.</div>
        )}
        <div className="row sp">
          <span className="muted">Total</span>
          <span className="total num">{rp(total)}</span>
        </div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <div className="row">
          <button
            type="button"
            className={pos.pay === 'tunai' ? 'btn primary' : 'btn'}
            onClick={() => choosePay('tunai')}
          >
            Tunai
          </button>
          <button
            type="button"
            className={pos.pay === 'qris' ? 'btn primary' : 'btn'}
            onClick={() => choosePay('qris')}
          >
            QRIS
          </button>
        </div>
        {pos.pay === 'tunai' ? (
          <>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="recv">Uang diterima (Rp)</label>
              <input
                id="recv"
                type="number"
                min="0"
                step="1000"
                value={recv}
                onChange={(e) => setRecv(e.target.value)}
              />
            </div>
            <div className="row sp small">
              <span className="muted">Kembalian</span>
              <b className="num" id="change">
                {received >= total && total > 0 ? rp(received - total) : '—'}
              </b>
            </div>
          </>
        ) : (
          <div className="small muted">
            Pembayaran QRIS. Konfirmasi setelah pembayaran dari pelanggan masuk.
          </div>
        )}
        {coldNeed > 0 && (
          <span className="small muted">
            Memakai {coldNeed} butir dari cold storage ({nf(cold)} tersedia)
          </span>
        )}
        <button type="button" className="btn primary lg" disabled={!total} onClick={checkout}>
          Selesaikan pembayaran
        </button>
        {total > 0 && (
          <button type="button" className="link" onClick={clear}>
            Kosongkan pesanan
          </button>
        )}
      </div>
    </div>
  );
}

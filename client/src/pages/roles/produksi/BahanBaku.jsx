import { rp, nf2 } from '../../../utils/formatters';
import erpService from '../../../api/erpService';

// Tab 1: Stok bahan baku
export default function BahanBaku({ data, notify, refreshData }) {
  const low = data.ingredients.filter((i) => i.stock <= i.rop);

  // Terbitkan PO: buat PO di backend lalu terima untuk menambah stok secara permanen
  const issuePo = async (id) => {
    const ing = data.ingredients.find((i) => i.id === id);
    if (!ing) return;
    const qty = (Number(ing.rop) || 10) * 2;
    try {
      const poRes = await erpService.createPurchaseOrder({
        ingredientId: id,
        quantity: qty,
        note: `Restok bahan baku ${ing.name}`,
      });
      const poId = poRes?.data?.purchaseOrder?.id;
      if (poId) {
        await erpService.receivePurchaseOrder(poId);
      }
      notify(`PO ${ing.name} (+${qty} ${ing.unit}) berhasil diproses ke database`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || 'Gagal memproses PO di server');
    }
  };

  return (
    <div className="panel">
      <div className="row sp">
        <h2>Stok bahan baku</h2>
        <span className="small muted">{low.length} bahan perlu dipesan ulang</span>
      </div>
      <div className="scroll" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Bahan</th>
              <th className="r">Stok</th>
              <th className="r">Batas pesan ulang</th>
              <th className="r">Harga beli terkini</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.ingredients.map((i) => {
              const isLow = i.stock <= i.rop;
              return (
                <tr key={i.id}>
                  <td>
                    <b>{i.name}</b>
                  </td>
                  <td className="r num">
                    {nf2(i.stock)} {i.unit}
                  </td>
                  <td className="r num">
                    {nf2(i.rop)} {i.unit}
                  </td>
                  <td className="r num">
                    {rp(i.price)}/{i.unit}
                  </td>
                  <td>
                    {isLow ? (
                      <span className="pill warn">Pesan ulang</span>
                    ) : (
                      <span className="pill good">Aman</span>
                    )}
                  </td>
                  <td className="r">
                    {isLow && (
                      <button type="button" className="btn sm" onClick={() => issuePo(i.id)}>
                        Terbitkan PO
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

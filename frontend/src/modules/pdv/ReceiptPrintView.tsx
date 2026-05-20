import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { salesApi, type Sale } from "@/api/pdv"
import { fmtMoney, fmtQty, fmtDateTime } from "./pdvUtils"

export default function ReceiptPrintView() {
  const { id } = useParams<{ id: string }>()
  const [sale, setSale] = useState<Sale | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!id) return
    salesApi.receipt(id)
      .then(setSale)
      .catch(() => setError("Não foi possível carregar a venda."))
  }, [id])

  useEffect(() => {
    if (sale) {
      const t = setTimeout(() => window.print(), 300)
      return () => clearTimeout(t)
    }
  }, [sale])

  if (error) return <p style={{ padding: 24, fontFamily: "monospace" }}>{error}</p>
  if (!sale) return <p style={{ padding: 24, fontFamily: "monospace" }}>Carregando…</p>

  return (
    <div
      style={{
        fontFamily: "monospace",
        maxWidth: 320,
        margin: "0 auto",
        padding: 16,
        fontSize: 12,
        color: "#000",
        background: "#fff",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>COMPROVANTE DE VENDA</strong>
        <div>{sale.number}</div>
        <div>{fmtDateTime(sale.created_at)}</div>
        {sale.status === "cancelled" && (
          <div style={{ marginTop: 4, fontWeight: "bold" }}>*** VENDA CANCELADA ***</div>
        )}
      </div>

      <hr />
      {sale.items.map(it => (
        <div key={it.id} style={{ marginBottom: 4 }}>
          <div>{it.product_name}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{fmtQty(it.quantity)} {it.unit} x {fmtMoney(it.unit_price)}</span>
            <span>{fmtMoney(it.line_total)}</span>
          </div>
          {Number(it.discount_amount) > 0 && (
            <div style={{ fontSize: 11 }}>desconto: -{fmtMoney(it.discount_amount)}</div>
          )}
        </div>
      ))}

      <hr />
      <Line label="Subtotal" value={fmtMoney(sale.subtotal)} />
      <Line label="Desconto" value={fmtMoney(sale.discount_amount)} />
      <Line label="TOTAL" value={fmtMoney(sale.total)} bold />

      <hr />
      {sale.payments.map(p => (
        <Line key={p.id} label={p.method_name} value={fmtMoney(p.amount)} />
      ))}
      <Line label="Pago" value={fmtMoney(sale.paid_amount)} />
      <Line label="Troco" value={fmtMoney(sale.change_amount)} />

      <hr />
      <div style={{ textAlign: "center", marginTop: 8 }}>Obrigado pela preferência!</div>
    </div>
  )
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? "bold" : "normal" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

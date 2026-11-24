"use client";

import { useState } from "react";
import { Activity, ArrowUpRight, Clock3, CreditCard, FileText, Users } from "lucide-react";
import { NavigationLink } from "@/components/ui/navigation-link";
import { formatHkdDollars as money } from "@/lib/payments/revenue";
import { periods, type BusinessSummary, type Period } from "@/lib/analytics/business";
import styles from "./business-dashboard.module.css";

const count = (n: number) => n.toLocaleString("en-US");
const shortDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });
const hour = (h: number) => String(h).padStart(2, "0") + ":00";

function RevenueChart({ data }: { data: BusinessSummary }) {
  const [mode, setMode] = useState<"daily" | "cumulative">("cumulative");
  const [index, setIndex] = useState(data.series.length - 1);
  const list = data.series;
  const selected = list[Math.min(index, list.length - 1)];
  const max = Math.max(1, ...list.map(d => d[mode]));
  const x = (i: number) => list.length === 1 ? 50 : i / (list.length - 1) * 100;
  const y = (value: number) => 95 - value / max * 89;
  const line = list.map((d, i) => `${x(i)},${y(d[mode])}`).join(" ");
  return <section className={`glass ${styles.panel}`}>
    <div className={styles.head}><h2>Revenue trend</h2><div className={styles.switcher}>
      {(["daily", "cumulative"] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "daily" ? "Daily" : "Cumulative"}</button>)}
    </div></div>
    <div className={styles.readout}><strong>{money(selected[mode])}</strong><span>{shortDate(selected.date)} · {mode === "daily" ? "Daily receipts" : "Period to date"}</span></div>
    <div className={styles.chartFrame}><div aria-hidden="true" className={styles.scale}><span>{money(max)}</span><span>HK$0</span></div><div className={styles.plot} onPointerMove={e => {
      if (e.pointerType !== "mouse") return;
      const box = e.currentTarget.getBoundingClientRect();
      setIndex(Math.max(0, Math.min(list.length - 1, Math.round((e.clientX - box.left) / box.width * (list.length - 1)))));
    }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="revenue-wash" x2="0" y2="1"><stop stopColor="#789dde" stopOpacity=".34"/><stop offset="1" stopColor="#789dde" stopOpacity=".015"/></linearGradient></defs>
        {[6, 35.67, 65.33, 95].map(v => <line key={v} x1="0" x2="100" y1={v} y2={v} className={styles.gridline}/>)}
        <polygon points={`${x(0)},95 ${line} ${x(list.length - 1)},95`} fill="url(#revenue-wash)"/>
        <polyline key={mode} points={line} pathLength="1" className={styles.curve}/>
        <line x1={x(index)} x2={x(index)} y1="2" y2="98" className={styles.crosshair}/>
      </svg><i className={styles.dot} style={{ left: x(index) + "%", top: y(selected[mode]) + "%" }}/>
      <input type="range" aria-label="Inspect revenue by date" aria-valuetext={selected.date + ", " + money(selected[mode])}
        min="0" max={list.length - 1} value={index} onChange={e => setIndex(Number(e.target.value))}/>
    </div>
    </div><div className={styles.axis}><span>{shortDate(list[0].date)}</span><span>{shortDate(list[list.length - 1].date)}</span></div>
    <div className={styles.breakdown}><span>Top-ups <b>{money(data.topups)}</b></span><span>Direct payments <b>{money(data.direct)}</b></span></div>
    <p className={styles.note}>Confirmed cash by transaction date. Awaiting verification · {money(data.unchecked)}</p>
  </section>;
}

export function BusinessDashboard({ data: d, period, preview = false }: { data: BusinessSummary; period: Period; preview?: boolean }) {
  const peak = Math.max(...d.hours);
  const peaks = d.hours.flatMap((n, i) => peak > 0 && n === peak ? [hour(i)] : []);
  const [inspectHour, setHour] = useState<number | null>(null);
  const stats = [
    { label: "Confirmed revenue", value: money(d.total), hint: count(d.transactions) + " cash transactions", Icon: CreditCard },
    { label: "Product buyers", value: count(d.buyers), hint: count(d.purchases) + " paid product purchases", Icon: Users },
    { label: "Repeat buyers", value: count(d.repeat), hint: "Bought twice or more this period", Icon: Activity },
    { label: "Average characters", value: d.average === null ? "—" : count(d.average), hint: count(d.measured) + " completed submissions with a recorded length", Icon: FileText },
  ];
  return <div className={styles.board}>
    <div className={styles.heading}><div><h1>Business analytics</h1><p>{preview && "Sample data · "}Hong Kong time · HKD</p></div>
      <nav aria-label="Analysis period" className={styles.switcher}>{periods.map(p =>
        <NavigationLink prefetch={false} key={p} href={(preview ? "/preview/admin-analytics" : "/admin/analytics") + "?period=" + p} aria-current={p === period ? "page" : undefined}>{p === "all" ? "All time" : p + " days"}</NavigationLink>)}</nav></div>
    <div className={styles.stats}>{stats.map(({ label, value, hint, Icon }) => <div key={label} className={`glass ${styles.stat}`}>
      <p><Icon size={16} aria-hidden="true"/>{label}</p><strong>{value}</strong><small>{hint}</small></div>)}</div>
    <div className={styles.charts}><RevenueChart data={d}/>
      <section className={`glass ${styles.panel}`}><div className={styles.head}><h2>Buying hours</h2><Clock3 size={18}/></div>
        <div className={styles.readout}><strong>{inspectHour !== null ? hour(inspectHour) : peaks.length ? peaks[0] : "—"}</strong>
        <span>{inspectHour !== null ? count(d.hours[inspectHour]) + " distinct buyers" : peak ? count(peak) + " distinct buyers at peak" : "No purchases in this period"}</span></div>
        <div className={styles.histogram}>{d.hours.map((n, i) => <button type="button" key={i}
          aria-label={hour(i) + " HKT, " + n + " buyers"} onPointerEnter={() => setHour(i)} onPointerLeave={() => setHour(null)}
          onFocus={() => setHour(i)} onBlur={() => setHour(null)} onClick={() => setHour(i)}
          data-peak={peak > 0 && n === peak} style={{ "--bar": (peak ? 100 * n / peak : 0) + "%" } as React.CSSProperties}><i/></button>)}</div>
        <div className={styles.axis}><span>00:00</span><span>12:00</span><span>23:00</span></div>
        <p className={styles.note}>Each buyer counts once per hour across the period. Includes credit purchases and paid refinements. Excludes top-ups.</p>
        {peaks.length > 1 && <p className={styles.note}>Joint peak · {peaks.join(", ")}</p>}
      </section></div>
    <section className={`glass ${styles.panel}`}><div className={styles.head}><h2>Product usage</h2><ArrowUpRight size={18}/></div>
      <p className={styles.note}>Completed customer orders grouped by purchase or activation date, plus refinements by delivery date. Ranked by distinct users.</p>
      {d.mix.length ? <table className={styles.table}><thead><tr><th>Product</th><th>Users</th><th>Uses</th></tr></thead><tbody>{d.mix.map(p =>
        <tr key={p.name}><td><span>{p.name}</span><i style={{ width: p.users / d.mix[0].users * 100 + "%" }}/></td><td>{count(p.users)}</td><td>{count(p.uses)}</td></tr>
      )}</tbody></table> : <p className={styles.note}>No completed products in this period.</p>}</section>
  </div>;
}

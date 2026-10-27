import type { PriceList, PriceListItem, ServicePrice } from "@platform/website-engine";
import styles from "./custom-price-list.module.css";

export function CustomPriceList({ list, locale }: { list: PriceList; locale: string }) {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency: list.currency });
  const price = (value: ServicePrice) => <span className={styles.price} data-price-cents={value.amountCents} data-price-from={value.from === true}>
    {value.from ? <small>{list.fromLabel}</small> : null}<span>{format.format(value.amountCents / 100)}</span>
  </span>;
  const label = (item: PriceListItem) => <>{item.label}{item.confirmationNote ? <span className={styles.confirmation}>{item.confirmationNote}</span> : null}</>;
  return <div className={styles.groups}>{list.groups.map((group, index) => {
    const tabular = group.items.filter(item => item.prices.length > 1);
    const single = group.items.filter(item => item.prices.length === 1);
    const headingId = `pricing-group-${index}`;
    return <article key={group.title} className={styles.card} aria-labelledby={headingId}>
      <div className={styles.groupHeading}><span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h3 id={headingId}>{group.title}</h3></div>
      {tabular.length ? <table className={styles.table} aria-labelledby={headingId}>
        <thead><tr><th scope="col">{list.serviceLabel}</th>{group.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{tabular.map(item => <tr key={item.label} data-price-service={item.label}>
          <th scope="row">{label(item)}</th>{item.prices.map((value, i) => <td key={group.columns[i]} data-label={group.columns[i]}>{price(value)}</td>)}
        </tr>)}</tbody>
      </table> : null}
      {single.length ? <dl className={styles.singles}>{single.map(item => <div key={item.label} data-price-service={item.label}><dt>{label(item)}</dt><dd>{price(item.prices[0])}</dd></div>)}</dl> : null}
    </article>;
  })}</div>;
}

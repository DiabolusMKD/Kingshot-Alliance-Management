import Image from 'next/image';
import { ItemQuantity } from '@/types';
import { formatItemQuantity, itemIcon, itemLabel } from '@/utils/items';
import styles from './ItemList.module.css';

interface ItemListProps {
  items: ItemQuantity[];
  /** Accessible name of the list, e.g. "Rewards" */
  label?: string;
  className?: string;
}

/** In-game items as chips: icon (or the item's name when we have no art) plus quantity. */
export default function ItemList({ items, label, className }: ItemListProps) {
  if (items.length === 0) return null;

  return (
    <ul className={className ? `${styles.list} ${className}` : styles.list} aria-label={label}>
      {items.map((entry, index) => {
        const name = itemLabel(entry.item);
        const icon = itemIcon(entry.item);
        const quantity = formatItemQuantity(entry);
        return (
          <li key={`${entry.item}-${index}`} className={styles.item} title={`${name} ${quantity}`}>
            {icon ? (
              <Image src={icon} alt={name} width={28} height={28} className={styles.icon} />
            ) : (
              <span className={styles.fallback}>{name}</span>
            )}
            <span className={styles.quantity}>{quantity}</span>
          </li>
        );
      })}
    </ul>
  );
}

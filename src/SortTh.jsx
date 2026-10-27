import Icon from './Icon.jsx';

// A column heading that sorts the list by that column: click to sort by it, click again to reverse. The arrow shows the order in use.
export default function SortTh({ k, label, sort, desc, onSort, className, hint }) {
  const on = sort === k;
  return (
    <th className={className} aria-sort={on ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button className={`thsort ${on ? 'on' : ''}`} onClick={() => onSort(k)} title={hint || `Sort by ${label.toLowerCase()}`}>
        {label}{on && <Icon name={desc ? 'arrowDown' : 'arrowUp'} size={12} />}
      </button>
    </th>
  );
}

// What a click on a heading does: a new column starts in its natural order (biggest, newest, most first; names A to Z), the same one reverses.
export const sortClick = (sort, desc, k, set) => {
  if (sort === k) set(sort, !desc);
  else set(k, !['title', 'type'].includes(k));
};

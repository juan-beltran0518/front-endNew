import { memo, useEffect, useMemo, useState } from 'react';
import Loader from './Loader.jsx';
import EmptyState from './EmptyState.jsx';

const Table = memo(function Table({
  columns,
  data = [],
  loading = false,
  pageSize = 8,
  rowKey = (row) => row.id,
  onRowClick,
  emptyMessage = 'Sin resultados',
}) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(0);
    }
  }, [page, totalPages]);

  const paginatedData = useMemo(() => {
    if (!data.length) return data;
    const start = page * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  if (loading) {
    return (
      <div className="table-loading">
        <Loader label="Cargando incidentes" />
      </div>
    );
  }

  if (!data.length) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((row) => (
            <tr
              key={rowKey(row)}
              tabIndex={0}
              onClick={() => onRowClick?.(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRowClick?.(row);
                }
              }}
            >
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row[column.key], row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-footer">
        <span>
          Página {page + 1} de {totalPages}
        </span>
        <div className="table-pagination">
          <button
            type="button"
            className="btn subtle"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
          >
            Anterior
          </button>
          <button
            type="button"
            className="btn subtle"
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            disabled={page >= totalPages - 1}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
});

export default Table;

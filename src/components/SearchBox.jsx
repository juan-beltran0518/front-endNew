import { useState } from 'react';

function SearchBox({
  defaultValue = '',
  placeholder = 'Buscar incidentes',
  onSearch,
  autoFocus = false,
  inputId = 'search-box',
}) {
  const [value, setValue] = useState(defaultValue);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSearch?.(value.trim());
  };

  return (
    <form className="search-box" role="search" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        Buscar
      </label>
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <button type="submit" className="btn primary">
        Buscar
      </button>
    </form>
  );
}

export default SearchBox;

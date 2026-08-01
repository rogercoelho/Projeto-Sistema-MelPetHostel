import { useRef, useState } from "react";
import { Button } from "../../components";
import {
  applyCepMask,
  cepDigits,
  createAddressList,
  createAddressForm,
  fetchAddressByCep,
  normalizeAddressList,
} from "../../utils/addressFields";

export default function AddressFields({ addresses, onChange }) {
  const [cepStatusByIndex, setCepStatusByIndex] = useState({});
  const rows = createAddressList(addresses);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  function updateAddress(index, patch, baseRows = rows) {
    const next = createAddressList(baseRows).map((address, currentIndex) =>
      currentIndex === index ? { ...address, ...patch } : address,
    );
    onChange(normalizeAddressList(next));
  }

  function addAddress() {
    onChange([...rows, createAddressForm({ principal: false }, rows.length)]);
  }

  function removeAddress(index) {
    const next = rows.filter((_, currentIndex) => currentIndex !== index);
    onChange(normalizeAddressList(next.length ? next : [createAddressForm()]));
  }

  function setPrincipal(index) {
    onChange(
      rows.map((address, currentIndex) => ({
        ...address,
        principal: currentIndex === index,
      })),
    );
  }

  async function lookupCep(index, cep) {
    setCepStatusByIndex((state) => ({ ...state, [index]: "Buscando CEP..." }));
    try {
      const found = await fetchAddressByCep(cep);
      const latestRows = rowsRef.current;
      const current = latestRows[index] || {};
      updateAddress(
        index,
        {
          ...found,
          numero: current.numero || "",
          complemento: current.complemento || found.complemento || "",
          principal: current.principal,
          ativo: current.ativo !== false,
        },
        latestRows,
      );
      setCepStatusByIndex((state) => ({ ...state, [index]: "" }));
    } catch (error) {
      setCepStatusByIndex((state) => ({
        ...state,
        [index]: error.message || "CEP não encontrado.",
      }));
    }
  }

  function handleCepChange(index, event) {
    const cep = applyCepMask(event);
    updateAddress(index, { cep });

    if (cepDigits(cep).length === 8) {
      lookupCep(index, cep);
    } else {
      setCepStatusByIndex((state) => ({ ...state, [index]: "" }));
    }
  }

  return (
    <div className="address-fields">
      <div className="address-fields-header">
        <span>Endereços</span>
        <Button type="button" variant="outline" size="sm" onClick={addAddress}>
          Adicionar endereço
        </Button>
      </div>

      <div className="address-fields-list">
        {rows.map((address, index) => (
          <fieldset className="address-fieldset" key={address.id || index}>
            <div className="address-fieldset-header">
              <strong>Endereço {index + 1}</strong>
              <div className="address-fieldset-actions">
                <label className="address-primary-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(address.principal)}
                    onChange={() => setPrincipal(index)}
                  />
                  Principal
                </label>
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeAddress(index)}
                  >
                    Remover
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="address-grid">
              <label>
                CEP
                <input
                  type="text"
                  value={address.cep}
                  onChange={(event) => handleCepChange(index, event)}
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="00000-000"
                />
                {cepStatusByIndex[index] ? (
                  <small>{cepStatusByIndex[index]}</small>
                ) : null}
              </label>
              <label>
                Logradouro
                <input
                  type="text"
                  value={address.logradouro}
                  onChange={(event) =>
                    updateAddress(index, { logradouro: event.target.value })
                  }
                  placeholder="Rua, avenida, estrada"
                />
              </label>
              <label>
                Número
                <input
                  type="text"
                  value={address.numero}
                  onChange={(event) =>
                    updateAddress(index, { numero: event.target.value })
                  }
                  placeholder="Número"
                />
              </label>
              <label>
                Complemento
                <input
                  type="text"
                  value={address.complemento}
                  onChange={(event) =>
                    updateAddress(index, { complemento: event.target.value })
                  }
                  placeholder="Complemento"
                />
              </label>
              <label>
                Bairro
                <input
                  type="text"
                  value={address.bairro}
                  onChange={(event) =>
                    updateAddress(index, { bairro: event.target.value })
                  }
                  placeholder="Bairro"
                />
              </label>
              <label>
                Cidade
                <input
                  type="text"
                  value={address.cidade}
                  onChange={(event) =>
                    updateAddress(index, { cidade: event.target.value })
                  }
                  placeholder="Cidade"
                />
              </label>
              <label>
                UF
                <input
                  type="text"
                  value={address.uf}
                  onChange={(event) =>
                    updateAddress(index, {
                      uf: event.target.value.toUpperCase().slice(0, 2),
                    })
                  }
                  maxLength={2}
                  placeholder="UF"
                />
              </label>
              <label>
                Estado
                <input
                  type="text"
                  value={address.estado}
                  onChange={(event) =>
                    updateAddress(index, { estado: event.target.value })
                  }
                  placeholder="Estado"
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

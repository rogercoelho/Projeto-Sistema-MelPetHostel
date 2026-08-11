import { useEffect, useState } from "react";
import { Button } from "../../components";
import { maskBrazilPhone, maskCpf, maskRg } from "../../utils/brFields";
import { toISODate } from "../../utils/date";
import AdminPageShell from "./AdminPageShell";

function formatValue(value) {
  const text = String(value || "").trim();
  return text || "-";
}

function maskSensitiveDocument(value, visibleStart = 3, visibleEnd = 2) {
  const text = String(value || "").trim();
  if (!text) return "-";

  const chars = text.replace(/\s/g, "").split("");
  let visibleSeen = 0;
  const totalVisible = chars.filter((char) => /[a-zA-Z0-9]/.test(char)).length;

  return chars
    .map((char) => {
      if (!/[a-zA-Z0-9]/.test(char)) return char;
      visibleSeen += 1;
      if (
        visibleSeen <= visibleStart ||
        visibleSeen > totalVisible - visibleEnd
      ) {
        return char;
      }
      return "*";
    })
    .join("");
}

function formatDate(value) {
  const iso = toISODate(value);
  if (!iso) return "-";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function formatAddress(endereco = {}) {
  return [
    endereco.logradouro,
    endereco.numero,
    endereco.complemento,
    endereco.bairro,
    endereco.cidade,
    endereco.uf || endereco.estado,
    endereco.cep,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function ClientProfilePage({ cliente, loading, error, onBack, onReload }) {
  const enderecos = Array.isArray(cliente?.enderecos) ? cliente.enderecos : [];

  return (
    <AdminPageShell
      title="Meus Dados Cadastrais"
      description="Consulte seus dados pessoais e endereços cadastrados."
      onBack={onBack}
    >
      <section className="admin-page-layout client-profile-readonly">
        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Dados pessoais</span>
            <h3>{formatValue(cliente?.nome)}</h3>
          </div>

          {loading ? (
            <p>Carregando dados cadastrais...</p>
          ) : error ? (
            <div className="client-profile-error">
              <p>{error}</p>
              <Button type="button" variant="secondary" onClick={onReload}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <dl className="client-profile-readonly-grid">
              <div>
                <dt>Nome</dt>
                <dd>{formatValue(cliente?.nome)}</dd>
              </div>
              <div>
                <dt>CPF</dt>
                <dd>
                  {cliente?.cpf
                    ? maskSensitiveDocument(maskCpf(cliente.cpf), 3, 2)
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>RG</dt>
                <dd>
                  {cliente?.rg
                    ? maskSensitiveDocument(maskRg(cliente.rg), 2, 2)
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>Data de nascimento</dt>
                <dd>{formatDate(cliente?.data_nascimento)}</dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>{cliente?.telefone ? maskBrazilPhone(cliente.telefone) : "-"}</dd>
              </div>
              <div>
                <dt>WhatsApp</dt>
                <dd>{cliente?.whatsapp ? maskBrazilPhone(cliente.whatsapp) : "-"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{formatValue(cliente?.email)}</dd>
              </div>
              <div className="client-profile-readonly-wide">
                <dt>Observações</dt>
                <dd>{formatValue(cliente?.observacoes)}</dd>
              </div>
            </dl>
          )}
        </section>

        {!loading && !error ? (
          <section className="admin-page-panel">
            <div className="admin-page-panel-title">
              <span>Endereços</span>
              <h3>Endereços cadastrados</h3>
            </div>

            {enderecos.length ? (
              <ul className="client-profile-address-list">
                {enderecos.map((endereco, index) => (
                  <li key={endereco.id || `${endereco.cep || "endereco"}-${index}`}>
                    {formatAddress(endereco) || "-"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhum endereço cadastrado.</p>
            )}
          </section>
        ) : null}
      </section>
    </AdminPageShell>
  );
}

export default ClientProfilePage;

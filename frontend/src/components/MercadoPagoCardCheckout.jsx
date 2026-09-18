import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import mercadoPagoLogo from "../assets/mercado-pago-tradicional.png";

let mercadoPagoSdkPromise;

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve();
  if (mercadoPagoSdkPromise) return mercadoPagoSdkPromise;

  mercadoPagoSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[src="https://sdk.mercadopago.com/js/v2"]',
    );
    const script = existingScript || document.createElement("script");

    script.addEventListener("load", resolve, { once: true });
    script.addEventListener(
      "error",
      () =>
        reject(
          new Error("N\u00e3o foi poss\u00edvel carregar o Mercado Pago."),
        ),
      { once: true },
    );

    if (!existingScript) {
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return mercadoPagoSdkPromise;
}

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getFriendlyPaymentError(reason) {
  const detail = [
    reason?.data?.statusDetalhePagamento,
    reason?.data?.statusPagamento,
    reason?.data?.mensagem,
    reason?.status_detail,
    reason?.code,
    reason?.message,
    reason?.cause?.code,
    reason?.cause?.message,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  if (detail.includes("insufficient_amount"))
    return "Recusado por quantia insuficiente.";
  if (
    detail.includes("security_code") ||
    detail.includes("invalid_security") ||
    detail.includes("invalid_cvv") ||
    detail.includes("bad_filled_security")
  )
    return "Recusado por codigo de seguranca invalido.";
  if (
    detail.includes("bad_filled_date") ||
    detail.includes("expiration") ||
    detail.includes("expiry") ||
    detail.includes("expired_card") ||
    detail.includes("invalid_date")
  )
    return "Recusado por problema com a data de vencimento.";
  if (detail.includes("bad_filled_card_number"))
    return "Recusado por erro no formulario.";
  if (
    detail.includes("call_for_authorize") ||
    detail.includes("pending_challenge")
  )
    return "Recusado com validacao para autorizar.";
  if (detail.includes("in_process") || detail.includes("pending"))
    return "Pagamento pendente.";
  if (detail.includes("bad_filled") || detail.includes("invalid_card_token"))
    return "Recusado por erro no formulario.";
  if (detail.includes("other_reason") || detail.includes("processing_error"))
    return "Recusado por erro geral.";
  return (
    reason?.data?.mensagem ||
    reason?.message ||
    "Nao foi possivel processar o cartao."
  );
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPendingPaymentStatus(status, statusDetail) {
  const normalized = `${status || ""} ${statusDetail || ""}`.toLowerCase();
  return [
    "pending",
    "processing",
    "created",
    "action_required",
    "in_review",
    "in_process",
    "contingency",
    "waiting",
  ].some((value) => normalized.includes(value));
}

async function waitForFinalPaymentStatus(paymentId, orderId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90000) {
    await sleep(3000);
    const result = await api.get(
      `/melpethostel/hospedagens/pagamentos/${paymentId}/cartao/status?orderId=${encodeURIComponent(orderId)}`,
    );
    if (
      !isPendingPaymentStatus(
        result?.statusPagamento,
        result?.statusDetalhePagamento,
      )
    )
      return result;
  }
  throw new Error(
    "O pagamento permanece em analise. Aguarde alguns instantes e atualize a pagina.",
  );
}
export default function MercadoPagoCardCheckout({
  payment,
  onPaid,
  onProcessingChange,
}) {
  const controllerRef = useRef(null);
  const onPaidRef = useRef(onPaid);
  const containerIdRef = useRef(`melpet-card-payment-brick-${payment.id}`);
  const payerEmailRef = useRef(payment.payerEmail || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payerEmail, setPayerEmail] = useState(payment.payerEmail || "");
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  useEffect(() => {
    let disposed = false;

    async function mountBrick() {
      try {
        const config = await api.get(
          "/melpethostel/pagamentos/mercadopago/config",
        );
        if (!config?.publicKey) {
          throw new Error(
            "A chave p\u00fablica do Mercado Pago n\u00e3o foi configurada.",
          );
        }

        await loadMercadoPagoSdk();
        if (disposed) return;

        const checkoutEmail = config.testMode
          ? "test@testuser.com"
          : payment.payerEmail || "";
        payerEmailRef.current = checkoutEmail;
        setPayerEmail(checkoutEmail);
        setTestMode(Boolean(config.testMode));

        const mercadoPago = new window.MercadoPago(config.publicKey, {
          locale: "pt-BR",
        });
        controllerRef.current = await mercadoPago
          .bricks()
          .create("cardPayment", containerIdRef.current, {
            initialization: {
              amount: Number(payment.valor),
            },
            customization: {
              paymentMethods: {
                types: { excluded: ["debit_card", "prepaid_card"] },
              },
              visual: {
                texts: {
                  email: { label: "E-mail do pagador" },
                },
              },
            },
            callbacks: {
              onReady: () => {
                if (!disposed) setLoading(false);
              },
              onSubmit: async (formData) => {
                const email = String(
                  formData?.payer?.email || payerEmailRef.current,
                ).trim();
                if (!/^\S+@\S+\.\S+$/.test(email)) {
                  const message =
                    "Informe um e-mail v\u00e1lido para o pagamento.";
                  setError(message);
                  throw new Error(message);
                }

                setSubmitting(true);
                setError("");
                try {
                  const result = await api.post(
                    `/melpethostel/hospedagens/pagamentos/${payment.id}/cartao`,
                    {
                      ...formData,
                      payer: {
                        ...formData.payer,
                        email,
                      },
                    },
                  );
                  const shouldWaitForFinalStatus =
                    isPendingPaymentStatus(
                      result?.statusPagamento,
                      result?.statusDetalhePagamento,
                    ) && result?.orderId;
                  let finalResult = result;
                  if (shouldWaitForFinalStatus) {
                    onProcessingChange?.(true);
                    try {
                      finalResult = await waitForFinalPaymentStatus(
                        payment.id,
                        result.orderId,
                      );
                    } finally {
                      onProcessingChange?.(false);
                    }
                  }
                  if (
                    [
                      "rejected",
                      "cancelled",
                      "canceled",
                      "failed",
                      "expired",
                    ].includes(
                      String(finalResult?.statusPagamento || "").toLowerCase(),
                    )
                  ) {
                    await onPaidRef.current?.(finalResult);
                    const paymentError = new Error(
                      finalResult?.mensagem ||
                        "Pagamento recusado pelo Mercado Pago.",
                    );
                    paymentError.data = finalResult;
                    throw paymentError;
                  }
                  await onPaidRef.current?.(finalResult);
                } catch (reason) {
                  setError(getFriendlyPaymentError(reason));
                  throw reason;
                } finally {
                  setSubmitting(false);
                }
              },
              onError: (reason) => {
                if (!disposed) {
                  setError(
                    (currentError) =>
                      currentError || getFriendlyPaymentError(reason),
                  );
                }
              },
            },
          });
      } catch (reason) {
        if (!disposed) {
          setError(
            reason?.message || "N\u00e3o foi poss\u00edvel abrir o checkout.",
          );
          setLoading(false);
        }
      }
    }

    mountBrick();
    return () => {
      disposed = true;
      controllerRef.current?.unmount?.();
      controllerRef.current = null;
    };
  }, [payment.id, payment.payerEmail, payment.valor]);

  return (
    <section className="melpet-card-checkout" aria-busy={loading || submitting}>
      <header className="melpet-card-checkout__header">
        <div className="melpet-card-checkout__provider">
          <span>Pagamento seguro via </span>
          <img
            className="melpet-card-checkout__mercadopago-logo"
            src={mercadoPagoLogo}
            alt="Mercado Pago"
          />
        </div>
        <strong>{"Cart\u00e3o de cr\u00e9dito"}</strong>
      </header>
      <p className="melpet-card-checkout__amount">
        Total: <strong>{formatCurrency(payment.valor)}</strong>
      </p>
      <div id={containerIdRef.current} />
      {loading ? <p>{"Carregando ambiente seguro\u2026"}</p> : null}
      {submitting ? <p>{"Processando pagamento\u2026"}</p> : null}
      {error ? <p className="melpet-error">{error}</p> : null}
    </section>
  );
}

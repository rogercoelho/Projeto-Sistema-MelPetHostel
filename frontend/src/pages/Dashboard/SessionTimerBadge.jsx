import { useSession } from "../../contexts/AuthContext";
import { formatSessionTime } from "../../utils/session";

export default function SessionTimerBadge() {
  const { tempoRestante } = useSession();

  if (tempoRestante === null) return null;

  return (
    <span
      className={`session-timer${
        tempoRestante <= 180 ? " session-timer--warning" : ""
      }`}
      title="Tempo restante de sessao"
    >
      {formatSessionTime(tempoRestante)}
    </span>
  );
}

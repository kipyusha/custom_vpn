import { Icon } from "./icons";
import { Modal } from "./Modal";

export function SiteModal({
  open,
  onClose,
  value,
  setValue,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Добавить сайт">
      <p className="modal-hint">
        Вставьте ссылку или домен. Сайт появится в правилах и его можно будет
        направить через VPN или напрямую.
      </p>
      <div className="inline-form">
        <input
          className="input"
          autoFocus
          placeholder="https://example.com или example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
        <button className="btn primary" onClick={onSubmit} disabled={busy}>
          <Icon name="plus" size={16} />
          Добавить
        </button>
      </div>
      <p className="fine-print">
        Дубли, включая поддомены уже добавленных сайтов, будут отклонены.
      </p>
    </Modal>
  );
}

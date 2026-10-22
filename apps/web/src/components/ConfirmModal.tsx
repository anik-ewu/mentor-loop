import { Button } from './Button';
import { Modal } from './Modal';

interface Props {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  text,
  confirmLabel,
  cancelLabel = 'Go back',
  danger,
  loading,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{text}</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
        <Button variant="ghost" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
          autoFocus
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

import { fmt } from "../lib/format.ts";
import type { NotificationItem } from "../types.ts";
import { BellIcon } from "./icons/BellIcon.tsx";
import { CloseIcon } from "./icons/CloseIcon.tsx";

export interface NotificationPanelProps {
  items: NotificationItem[];
  unreadCount: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMarkOne: (id: string) => void;
  onMarkAll: () => void;
  onOpenItem?: (item: NotificationItem) => void;
  targetFor?: (item: NotificationItem) => string | null;
}

// Bell button, badge, and dropdown panel — presentation only. Navigation and
// marking are caller callbacks; `targetFor` tells the panel which rows can
// jump to a source.
export function NotificationPanel(props: NotificationPanelProps) {
  const {
    items,
    unreadCount,
    open,
    onToggle,
    onClose,
    onMarkOne,
    onMarkAll,
    onOpenItem,
    targetFor,
  } = props;
  return (
    <div className="notifwrap">
      <button
        type="button"
        className="notiftoggle"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        title={
          unreadCount > 0
            ? `${unreadCount} unread notifications`
            : "Notifications"
        }
        aria-expanded={open}
        onClick={onToggle}
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <span className="notifbadge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="notifscrim"
            aria-label="Close notifications"
            onClick={onClose}
          />
          <section className="notifpanel" aria-label="Notifications">
            <div className="notifhdr">
              <strong>Notifications</strong>
              <div>
                <button
                  type="button"
                  disabled={unreadCount === 0}
                  onClick={onMarkAll}
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  aria-label="Close notifications"
                  title="Close notifications"
                  onClick={onClose}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="notifempty">No notifications.</p>
            ) : (
              <ul className="notiflist">
                {items.map((notification) => {
                  const target = targetFor?.(notification) ?? null;
                  return (
                    <li
                      key={notification.id}
                      className={notification.read ? "" : "unread"}
                    >
                      <button
                        type="button"
                        className="notifbody"
                        disabled={!target && notification.read !== 0}
                        title={target ? "Open source" : "Mark as read"}
                        onClick={() => onOpenItem?.(notification)}
                      >
                        <strong>{notification.title}</strong>
                        <time
                          dateTime={new Date(
                            notification.created_at,
                          ).toISOString()}
                        >
                          {fmt(notification.created_at)}
                        </time>
                        <p>{notification.body}</p>
                      </button>
                      {!notification.read && (
                        <div className="notifactions">
                          <button
                            type="button"
                            onClick={() => onMarkOne(notification.id)}
                          >
                            Mark read
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

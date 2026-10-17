# Confirmation dialogs

- Every destructive action asks for confirmation before it executes: Delete bot, Clear memory, Delete role, and Remove trigger.
- The dialog names the affected object ("Delete bot Atlas?" / "Clear the stored context of Atlas?") and offers a confirm button plus Cancel; Escape and outside taps mean Cancel.
- Confirmation renders above any open modal (the detail or role modal stays behind it); nothing is sent to the API until confirm.

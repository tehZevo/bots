# Bot avatars

- Every bot shows an avatar on its card and in the detail modal header.
- An avatar is initials over a solid color: up to two characters taken from the bot name (first letters of the first two words, else the first two letters), uppercased.
- The background color is derived deterministically by hashing the bot id into a fixed palette; the same id always yields the same color.
- Nothing about an avatar is stored or uploaded; changing the bot's name changes only the initials, never the color.
- On a card, the avatar sits at the left with the bot's name to its right, top-aligned.

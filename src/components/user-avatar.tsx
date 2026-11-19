import * as React from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar.tsx";
import { getGravatarUrl } from "@/lib/utils.tsx";

const cache = new Map<string, true>();

function markErrorCached(username: string) {
  if (cache.has(username)) {
    return;
  }
  cache.set(username, true);
}

function isErrorCached(username: string) {
  return cache.has(username);
}

setInterval(
  () => {
    cache.clear();
  },
  1000 * 60 * 15,
); // 15 minutes

export const UserAvatar = React.memo(function UserAvatar(props: {
  username: string;
  email: string;
  className?: string;
}) {
  const [isError, setIsError] = React.useState(isErrorCached(props.email));

  return (
    <Avatar className={props.className}>
      {!isError && (
        <AvatarImage
          onLoadingStatusChange={(e) => {
            if (e === "error") {
              markErrorCached(props.email);
              setIsError(true);
            }
          }}
          src={getGravatarUrl(props.email)}
          alt={props.username}
        />
      )}
      <AvatarFallback>
        {props.username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
});

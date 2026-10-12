import { renderApp } from "@todo/ui";
import { desktopPlatform } from "./desktop-platform";

renderApp(desktopPlatform(window.desktop));

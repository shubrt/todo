import { createFileRoute } from "@tanstack/react-router";
import { TodoApp } from "../features/todo-app";

export const Route = createFileRoute("/")({ component: TodoApp });

import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const handleJsonBodyErrors: ErrorRequestHandler = (error, req, res, next) => {
  if (
    error &&
    typeof error === "object" &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    req.log.warn("Dish photo upload exceeded the request size limit");
    res.status(413).json({
      error: "Upload is too large. Choose a photo no larger than 3 MB.",
    });
    return;
  }

  next(error);
};

app.use(handleJsonBodyErrors);

export default app;

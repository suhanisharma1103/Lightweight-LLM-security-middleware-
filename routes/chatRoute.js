import express from "express";
import behavioralController from "../controller/behavioralController.js"

const router = express.Router();

router.post("/", behavioralController);

export default router;

import * as async_channels from "@eyalsh/async_channels"
const {BroadcastChannel, BroadcastSendModes} = async_channels
import express from "express"

const app = express();
const port = process.env.PORT || 5000; //Line 3

app.listen(port, () => console.log(`Listening on port ${port}`));

const exchanges = new Map()

app.post("/api/exchanges/:exchange", async (req, res) => {
  const sendMode = req.query.sendMode || BroadcastSendModes.WaitForOne
  exchanges.set(req.params.exchange, new BroadcastChannel((msg) => msg.topic, {sendMode}))
  res.status(202)
})

#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Ge O'Miner  --  Create & Join Channel
# ---------------------------------------------------------------------------
# Usage:  ./create-channel.sh
# Assumes the Fabric test network containers are already running.
# ---------------------------------------------------------------------------
set -euo pipefail

CHANNEL_NAME="geominer-channel"
ORDERER_URL="orderer.geominer.ci:7050"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/geominer.ci/orderers/orderer.geominer.ci/msp/tlscacerts/tlsca.geominer.ci-cert.pem"

PEER0_MINISTRY="peer0.ministry.geominer.ci:7051"
PEER0_GSLOI="peer0.gsloi.geominer.ci:9051"

MINISTRY_MSP="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/ministry.geominer.ci/users/Admin@ministry.geominer.ci/msp"
GSLOI_MSP="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/gsloi.geominer.ci/users/Admin@gsloi.geominer.ci/msp"

MINISTRY_TLS_ROOT="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/ministry.geominer.ci/peers/peer0.ministry.geominer.ci/tls/ca.crt"
GSLOI_TLS_ROOT="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/gsloi.geominer.ci/peers/peer0.gsloi.geominer.ci/tls/ca.crt"

export FABRIC_CFG_PATH="/etc/hyperledger/fabric"

echo "============================================================="
echo "  Creating channel: ${CHANNEL_NAME}"
echo "============================================================="

# ---------------------------------------------------------------------------
# 1. Create channel
# ---------------------------------------------------------------------------
echo ">>> Creating channel genesis block ..."
export CORE_PEER_LOCALMSPID="MinistryMinesMSP"
export CORE_PEER_MSPCONFIGPATH="${MINISTRY_MSP}"
export CORE_PEER_TLS_ROOTCERT_FILE="${MINISTRY_TLS_ROOT}"
export CORE_PEER_ADDRESS="${PEER0_MINISTRY}"

peer channel create \
  -o "${ORDERER_URL}" \
  -c "${CHANNEL_NAME}" \
  -f "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.tx" \
  --outputBlock "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block" \
  --tls \
  --cafile "${ORDERER_CA}"

echo ">>> Channel ${CHANNEL_NAME} created successfully."

# ---------------------------------------------------------------------------
# 2. Join peer0.ministry
# ---------------------------------------------------------------------------
echo ">>> Joining peer0.ministry.geominer.ci ..."
export CORE_PEER_LOCALMSPID="MinistryMinesMSP"
export CORE_PEER_MSPCONFIGPATH="${MINISTRY_MSP}"
export CORE_PEER_TLS_ROOTCERT_FILE="${MINISTRY_TLS_ROOT}"
export CORE_PEER_ADDRESS="${PEER0_MINISTRY}"

peer channel join \
  -b "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block"

echo ">>> peer0.ministry.geominer.ci joined ${CHANNEL_NAME}."

# ---------------------------------------------------------------------------
# 3. Join peer0.gsloi
# ---------------------------------------------------------------------------
echo ">>> Joining peer0.gsloi.geominer.ci ..."
export CORE_PEER_LOCALMSPID="GSLOISMSP"
export CORE_PEER_MSPCONFIGPATH="${GSLOI_MSP}"
export CORE_PEER_TLS_ROOTCERT_FILE="${GSLOI_TLS_ROOT}"
export CORE_PEER_ADDRESS="${PEER0_GSLOI}"

peer channel join \
  -b "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block"

echo ">>> peer0.gsloi.geominer.ci joined ${CHANNEL_NAME}."

# ---------------------------------------------------------------------------
# 4. Update anchor peers -- MinistryMines
# ---------------------------------------------------------------------------
echo ">>> Updating anchor peer for MinistryMinesMSP ..."
export CORE_PEER_LOCALMSPID="MinistryMinesMSP"
export CORE_PEER_MSPCONFIGPATH="${MINISTRY_MSP}"
export CORE_PEER_TLS_ROOTCERT_FILE="${MINISTRY_TLS_ROOT}"
export CORE_PEER_ADDRESS="${PEER0_MINISTRY}"

peer channel update \
  -o "${ORDERER_URL}" \
  -c "${CHANNEL_NAME}" \
  -f "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/MinistryMinesMSPanchors.tx" \
  --tls \
  --cafile "${ORDERER_CA}"

echo ">>> Anchor peer updated for MinistryMinesMSP."

# ---------------------------------------------------------------------------
# 5. Update anchor peers -- GSLOI
# ---------------------------------------------------------------------------
echo ">>> Updating anchor peer for GSLOISMSP ..."
export CORE_PEER_LOCALMSPID="GSLOISMSP"
export CORE_PEER_MSPCONFIGPATH="${GSLOI_MSP}"
export CORE_PEER_TLS_ROOTCERT_FILE="${GSLOI_TLS_ROOT}"
export CORE_PEER_ADDRESS="${PEER0_GSLOI}"

peer channel update \
  -o "${ORDERER_URL}" \
  -c "${CHANNEL_NAME}" \
  -f "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/GSLOISMSPanchors.tx" \
  --tls \
  --cafile "${ORDERER_CA}"

echo ">>> Anchor peer updated for GSLOISMSP."

echo "============================================================="
echo "  Channel ${CHANNEL_NAME} ready -- both peers joined."
echo "============================================================="

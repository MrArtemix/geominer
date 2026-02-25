#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Ge O'Miner  --  Deploy site-cc Chaincode (Fabric 2.x Lifecycle)
# ---------------------------------------------------------------------------
# Usage:  ./deploy-chaincode.sh
# Assumes the channel has already been created and both peers joined.
# ---------------------------------------------------------------------------
set -euo pipefail

CHANNEL_NAME="geominer-channel"
CC_NAME="site-cc"
CC_VERSION="1.0"
CC_SEQUENCE=1
CC_SRC_PATH="/opt/gopath/src/github.com/geominer/chaincodes/site-cc"
CC_LABEL="${CC_NAME}_${CC_VERSION}"

ORDERER_URL="orderer.geominer.ci:7050"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/geominer.ci/orderers/orderer.geominer.ci/msp/tlscacerts/tlsca.geominer.ci-cert.pem"

PEER0_MINISTRY="peer0.ministry.geominer.ci:7051"
PEER0_GSLOI="peer0.gsloi.geominer.ci:9051"

MINISTRY_MSP="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/ministry.geominer.ci/users/Admin@ministry.geominer.ci/msp"
GSLOI_MSP="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/gsloi.geominer.ci/users/Admin@gsloi.geominer.ci/msp"

MINISTRY_TLS_ROOT="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/ministry.geominer.ci/peers/peer0.ministry.geominer.ci/tls/ca.crt"
GSLOI_TLS_ROOT="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/gsloi.geominer.ci/peers/peer0.gsloi.geominer.ci/tls/ca.crt"

export FABRIC_CFG_PATH="/etc/hyperledger/fabric"

# ---------------------------------------------------------------------------
# Helper: switch peer context
# ---------------------------------------------------------------------------
set_ministry_context() {
  export CORE_PEER_LOCALMSPID="MinistryMinesMSP"
  export CORE_PEER_MSPCONFIGPATH="${MINISTRY_MSP}"
  export CORE_PEER_TLS_ROOTCERT_FILE="${MINISTRY_TLS_ROOT}"
  export CORE_PEER_ADDRESS="${PEER0_MINISTRY}"
}

set_gsloi_context() {
  export CORE_PEER_LOCALMSPID="GSLOISMSP"
  export CORE_PEER_MSPCONFIGPATH="${GSLOI_MSP}"
  export CORE_PEER_TLS_ROOTCERT_FILE="${GSLOI_TLS_ROOT}"
  export CORE_PEER_ADDRESS="${PEER0_GSLOI}"
}

echo "============================================================="
echo "  Deploying chaincode: ${CC_NAME} v${CC_VERSION}"
echo "============================================================="

# ---------------------------------------------------------------------------
# 1. Package chaincode
# ---------------------------------------------------------------------------
echo ">>> Packaging chaincode ..."
peer lifecycle chaincode package "${CC_NAME}.tar.gz" \
  --path "${CC_SRC_PATH}" \
  --lang golang \
  --label "${CC_LABEL}"

echo ">>> Chaincode packaged as ${CC_NAME}.tar.gz"

# ---------------------------------------------------------------------------
# 2. Install on peer0.ministry
# ---------------------------------------------------------------------------
echo ">>> Installing on peer0.ministry.geominer.ci ..."
set_ministry_context

peer lifecycle chaincode install "${CC_NAME}.tar.gz"

echo ">>> Installed on peer0.ministry.geominer.ci"

# ---------------------------------------------------------------------------
# 3. Install on peer0.gsloi
# ---------------------------------------------------------------------------
echo ">>> Installing on peer0.gsloi.geominer.ci ..."
set_gsloi_context

peer lifecycle chaincode install "${CC_NAME}.tar.gz"

echo ">>> Installed on peer0.gsloi.geominer.ci"

# ---------------------------------------------------------------------------
# 4. Query installed & extract package ID
# ---------------------------------------------------------------------------
echo ">>> Querying installed chaincodes ..."
set_ministry_context

PACKAGE_ID=$(peer lifecycle chaincode queryinstalled \
  --output json | jq -r ".installed_chaincodes[] | select(.label==\"${CC_LABEL}\") | .package_id")

if [ -z "${PACKAGE_ID}" ]; then
  echo "ERROR: Could not find package ID for label ${CC_LABEL}"
  exit 1
fi

echo ">>> Package ID: ${PACKAGE_ID}"

# ---------------------------------------------------------------------------
# 5. Approve for MinistryMines
# ---------------------------------------------------------------------------
echo ">>> Approving for MinistryMinesMSP ..."
set_ministry_context

peer lifecycle chaincode approveformyorg \
  -o "${ORDERER_URL}" \
  --channelID "${CHANNEL_NAME}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --package-id "${PACKAGE_ID}" \
  --sequence ${CC_SEQUENCE} \
  --tls \
  --cafile "${ORDERER_CA}"

echo ">>> Approved for MinistryMinesMSP"

# ---------------------------------------------------------------------------
# 6. Approve for GSLOI
# ---------------------------------------------------------------------------
echo ">>> Approving for GSLOISMSP ..."
set_gsloi_context

peer lifecycle chaincode approveformyorg \
  -o "${ORDERER_URL}" \
  --channelID "${CHANNEL_NAME}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --package-id "${PACKAGE_ID}" \
  --sequence ${CC_SEQUENCE} \
  --tls \
  --cafile "${ORDERER_CA}"

echo ">>> Approved for GSLOISMSP"

# ---------------------------------------------------------------------------
# 7. Check commit readiness
# ---------------------------------------------------------------------------
echo ">>> Checking commit readiness ..."
set_ministry_context

peer lifecycle chaincode checkcommitreadiness \
  --channelID "${CHANNEL_NAME}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --sequence ${CC_SEQUENCE} \
  --tls \
  --cafile "${ORDERER_CA}" \
  --output json

# ---------------------------------------------------------------------------
# 8. Commit chaincode definition
# ---------------------------------------------------------------------------
echo ">>> Committing chaincode definition ..."
set_ministry_context

peer lifecycle chaincode commit \
  -o "${ORDERER_URL}" \
  --channelID "${CHANNEL_NAME}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --sequence ${CC_SEQUENCE} \
  --tls \
  --cafile "${ORDERER_CA}" \
  --peerAddresses "${PEER0_MINISTRY}" \
  --tlsRootCertFiles "${MINISTRY_TLS_ROOT}" \
  --peerAddresses "${PEER0_GSLOI}" \
  --tlsRootCertFiles "${GSLOI_TLS_ROOT}"

echo ">>> Chaincode committed."

# ---------------------------------------------------------------------------
# 9. Verify committed chaincode
# ---------------------------------------------------------------------------
echo ">>> Verifying committed chaincode ..."
peer lifecycle chaincode querycommitted \
  --channelID "${CHANNEL_NAME}" \
  --name "${CC_NAME}" \
  --cafile "${ORDERER_CA}"

echo "============================================================="
echo "  Chaincode ${CC_NAME} v${CC_VERSION} deployed successfully!"
echo "============================================================="

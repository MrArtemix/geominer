// ---------------------------------------------------------------------------
// Ge O'Miner  --  goldtrack-cc Chaincode Entry Point
// ---------------------------------------------------------------------------
package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	goldtrackContract := new(GoldTrackContract)

	chaincode, err := contractapi.NewChaincode(goldtrackContract)
	if err != nil {
		log.Fatalf("Erreur creation goldtrack-cc chaincode: %v", err)
	}

	chaincode.Info.Title = "GeOMiner GoldTrack Chaincode"
	chaincode.Info.Version = "1.0.0"

	if err := chaincode.Start(); err != nil {
		log.Fatalf("Erreur demarrage goldtrack-cc chaincode: %v", err)
	}
}

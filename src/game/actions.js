export const ACTION_TYPES = {
  MOVE: 'MOVE',
  END_TURN: 'END_TURN',
  PLAY_CARD: 'PLAY_CARD',
};

export function moveAction(pieceId, col, row) {
  return {
    type: ACTION_TYPES.MOVE,
    pieceId,
    col,
    row,
  };
}

export function endTurnAction() {
  return {
    type: ACTION_TYPES.END_TURN,
  };
}

export function playCardAction(cardUid, col, row) {
  return {
    type: ACTION_TYPES.PLAY_CARD,
    cardUid,
    col,
    row,
  };
}
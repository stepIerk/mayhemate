import Phaser from 'phaser';
import { Game } from '../game/Game.js';
import { GameSession } from '../game/GameSession.js';
import { clearSession, saveSession } from '../game/sessionPersistence.js';
import { PeerTransport } from '../net/PeerTransport.js';
import { PROTOCOL_VERSION, normalizeRoomCode } from '../net/protocol.js';
import ButtonView from '../render/ButtonView.js';

const HOST_RETRY_LIMIT = 10;
const JOIN_RETRY_LIMIT = 20;
const RETRY_DELAY = 1500;
const HOST_RETRY_DELAY = 2000;

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
  }

  init(data) {
    this.mode = data?.mode ?? 'local';
    this.joinCode = data?.code ?? '';
    this.resume = data?.resume ?? null;
    this.isResuming = Boolean(this.resume);
    this.transport = null;
    this.session = null;
    this.code = this.resume?.code ?? null;
    this.handedOff = false;
    this.isShuttingDown = false;
    this.unsubscribeStatus = null;
    this.unsubscribeMessage = null;
    this.welcomeTimeout = null;
    this.retryTimer = null;
    this.hostAttempts = 0;
    this.joinAttempts = 0;
    this.joinPending = false;
    this.attemptId = 0;
  }

  create() {
    this.title = this.add
      .text(0, 0, 'Mayhemate', {
        fontFamily: 'Arial',
        fontSize: '56px',
        color: '#955e23',
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);

    this.codeText = this.add
      .text(0, 0, '', {
        fontFamily: '"DotumChe", monospace',
        fontSize: '48px',
        color: '#ffd166',
        align: 'center',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.codeText.on('pointerdown', () => this.copyCode());

    this.hintText = this.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#9aa0b4',
        align: 'center',
      })
      .setOrigin(0.5);

    this.cancelButton = new ButtonView(this, 'Назад', 160, 44, () => {
      this.exitToHome();
    });

    this.layout();
    this.scale.on('resize', this.layout, this);

    this.events.once('shutdown', () => {
      this.isShuttingDown = true;
      this.scale.off('resize', this.layout, this);
      clearTimeout(this.welcomeTimeout);
      clearTimeout(this.retryTimer);
      this.unsubscribeStatus?.();
      this.unsubscribeStatus = null;
      this.unsubscribeMessage?.();
      this.unsubscribeMessage = null;

      if (!this.handedOff) {
        this.closeTransport();
      }
    });

    if (this.mode === 'local') {
      this.startLocal();
      return;
    }

    if (this.mode === 'host') {
      this.startHost();
      return;
    }

    this.startJoin(this.joinCode);
  }

  layout(gameSize) {
    const width = gameSize?.width ?? this.scale.width;
    const height = gameSize?.height ?? this.scale.height;
    const centerX = width / 2;

    this.title.setPosition(centerX, height * 0.18);
    this.statusText.setPosition(centerX, height * 0.33);
    this.statusText.setWordWrapWidth(Math.max(240, width * 0.86));
    this.codeText.setPosition(centerX, height * 0.45);
    this.hintText.setPosition(centerX, height * 0.55);
    this.hintText.setWordWrapWidth(Math.max(240, width * 0.86));
    this.cancelButton.layout(centerX, height * 0.7);
  }

  setStatus(text) {
    if (this.isShuttingDown || !this.statusText) {
      return;
    }
    this.statusText.setText(text);
  }

  showCode(code) {
    if (this.isShuttingDown || !this.codeText) {
      return;
    }
    this.codeText.setText(code);
    this.hintText.setText(
      'Передай код другу или открой вторую вкладку. Не закрывай эту вкладку.'
    );
  }

  copyCode() {
    if (!this.code || !navigator.clipboard) {
      return;
    }

    navigator.clipboard
      .writeText(this.code)
      .then(() => this.setStatus('Код скопирован'))
      .catch(() => {});
  }

  restoreGame() {
    if (!this.resume?.game) {
      return null;
    }

    try {
      return Game.fromState(this.resume.game);
    } catch {
      return null;
    }
  }

  startLocal() {
    const session = new GameSession({ role: 'local' });
    this.handedOff = true;
    this.scene.start('GameScene', { session, localColor: null });
  }

  async startHost() {
    if (this.isShuttingDown || this.handedOff) {
      return;
    }

    const attempt = ++this.attemptId;
    const resuming = this.isResuming;
    const game = this.restoreGame();

    this.setStatus(resuming ? 'Восстановление комнаты...' : 'Создание комнаты...');

    this.transport = new PeerTransport({ role: 'host' });
    this.unsubscribeStatus = this.transport.onStatus((status, detail) =>
      this.onHostStatus(status, detail)
    );
    this.session = new GameSession({
      game: game ?? new Game(),
      role: 'host',
      transport: this.transport,
      localColor: 'white',
      remoteColor: 'black',
      seq: this.resume?.seq ?? 0,
      code: this.resume?.code ?? null,
    });

    try {
      const code = await this.transport.host(this.resume?.code ?? null);

      if (attempt !== this.attemptId || this.isShuttingDown || this.handedOff) {
        return;
      }

      this.code = code;
      this.session.code = code;
      saveSession(this.session);
      this.showCode(code);
      this.setStatus('Ожидание игрока...');
    } catch (error) {
      if (attempt !== this.attemptId || this.isShuttingDown || this.handedOff) {
        return;
      }

      if (resuming && this.canRetryHost(error)) {
        this.scheduleHostRetry();
        return;
      }

      this.setStatus(this.describeError(error));
      this.closeTransport();

      if (resuming) {
        clearSession();
      }
    }
  }

  canRetryHost(error) {
    const type = error?.type ?? error?.message ?? 'closed';
    const retryable = [
      'unavailable-id',
      'signaling-timeout',
      'network',
      'server-error',
      'disconnected',
      'closed',
    ].includes(type);

    return retryable && this.hostAttempts < HOST_RETRY_LIMIT;
  }

  scheduleHostRetry() {
    this.hostAttempts += 1;

    if (this.hostAttempts > HOST_RETRY_LIMIT) {
      this.setStatus('Не удалось восстановить комнату');
      this.closeTransport();
      clearSession();
      return;
    }

    this.closeTransport();
    this.setStatus(
      `Восстановление комнаты... (${this.hostAttempts}/${HOST_RETRY_LIMIT})`
    );
    this.retryTimer = setTimeout(() => this.startHost(), HOST_RETRY_DELAY);
  }

  onHostStatus(status, detail) {
    if (this.handedOff || this.isShuttingDown || !this.session) {
      return;
    }

    if (status === 'waiting') {
      this.setStatus('Ожидание игрока...');
      return;
    }

    if (status === 'connected') {
      const sent = this.transport.send({
        t: 'welcome',
        v: PROTOCOL_VERSION,
        you: 'black',
        hostColor: 'white',
        state: this.session.toState(),
        seq: this.session.seq,
      });

      if (!sent) {
        this.setStatus('Не удалось отправить состояние игры');
        this.closeTransport();
        return;
      }

      saveSession(this.session);
      this.handedOff = true;
      this.scene.start('GameScene', {
        session: this.session,
        localColor: 'white',
      });
      return;
    }

    if (status === 'error') {
      const type = detail?.type ?? detail?.message;
      this.setStatus(this.describeError(detail));

      if (type === 'protocol-version-mismatch') {
        return;
      }

      if (this.isResuming && this.canRetryHost(detail)) {
        this.scheduleHostRetry();
        return;
      }

      this.closeTransport();

      if (this.isResuming) {
        clearSession();
      }
      return;
    }

    if (status === 'disconnected') {
      if (this.isResuming && this.canRetryHost(detail)) {
        this.scheduleHostRetry();
        return;
      }

      this.setStatus('Связь с сервером PeerJS потеряна');
      this.closeTransport();

      if (this.isResuming) {
        clearSession();
      }
      return;
    }

    if (status === 'closed') {
      if (detail === 'left') {
        this.setStatus('Игрок вышел');
        this.closeTransport();
        return;
      }

      if (this.isResuming && this.canRetryHost(detail)) {
        this.scheduleHostRetry();
        return;
      }

      this.setStatus('Комната закрыта');
      this.closeTransport();

      if (this.isResuming) {
        clearSession();
      }
    }
  }

  async startJoin(code) {
    const normalized = normalizeRoomCode(this.resume?.code ?? code);

    if (!normalized) {
      this.setStatus('Введите код комнаты');

      if (this.isResuming) {
        clearSession();
      }
      return;
    }

    this.code = normalized;
    this.joinCode = normalized;
    this.joinAttempts = 0;
    await this.tryJoin(normalized);
  }

  async tryJoin(code) {
    if (this.isShuttingDown || this.handedOff) {
      return;
    }

    const attempt = ++this.attemptId;
    const resuming = this.isResuming;
    const game = this.restoreGame();

    this.setStatus(
      resuming ? `Переподключение к комнате ${code}...` : 'Подключение к серверу PeerJS...'
    );

    this.transport = new PeerTransport({ role: 'guest' });
    this.unsubscribeStatus = this.transport.onStatus((status, detail) =>
      this.onGuestStatus(status, detail)
    );
    this.unsubscribeMessage = this.transport.onMessage((message) =>
      this.onGuestMessage(message)
    );
    this.session = new GameSession({
      game: game ?? new Game(),
      role: 'guest',
      transport: this.transport,
      localColor: this.resume?.localColor ?? null,
      seq: this.resume?.seq ?? 0,
      code,
    });

    this.joinPending = true;

    try {
      await this.transport.join(code);

      if (attempt !== this.attemptId || this.isShuttingDown || this.handedOff) {
        return;
      }

      this.joinPending = false;
      this.setStatus('Ожидание ответа хоста...');
      this.welcomeTimeout = setTimeout(() => {
        if (attempt !== this.attemptId || this.handedOff || this.isShuttingDown) {
          return;
        }

        if (this.isResuming) {
          this.scheduleJoinRetry();
          return;
        }

        this.setStatus('Хост не ответил');
        this.closeTransport();
      }, 15000);
    } catch (error) {
      if (attempt !== this.attemptId || this.isShuttingDown || this.handedOff) {
        return;
      }

      this.joinPending = false;
      this.handleJoinFailure(error);
    }
  }

  canRetryJoin(error) {
    const type = error?.type ?? error?.message ?? 'closed';
    const retryable = [
      'peer-unavailable',
      'connection-timeout',
      'signaling-timeout',
      'network',
      'server-error',
      'disconnected',
      'closed',
      'room-full',
      'welcome-timeout',
    ].includes(type);

    return retryable && this.joinAttempts < JOIN_RETRY_LIMIT;
  }

  handleJoinFailure(error) {
    if (this.isResuming && this.canRetryJoin(error)) {
      this.scheduleJoinRetry();
      return;
    }

    this.setStatus(this.describeError(error));
    this.closeTransport();

    if (this.isResuming) {
      clearSession();
    }
  }

  scheduleJoinRetry() {
    this.joinAttempts += 1;

    if (this.joinAttempts > JOIN_RETRY_LIMIT) {
      this.setStatus('Не удалось переподключиться');
      this.closeTransport();
      clearSession();
      return;
    }

    this.closeTransport();
    this.setStatus(
      `Переподключение... (${this.joinAttempts}/${JOIN_RETRY_LIMIT})`
    );
    this.retryTimer = setTimeout(
      () => this.tryJoin(this.code),
      RETRY_DELAY
    );
  }

  onGuestMessage(message) {
    if (this.handedOff || this.isShuttingDown) {
      return;
    }

    if (message?.t !== 'welcome') {
      return;
    }

    if (message.v !== PROTOCOL_VERSION) {
      this.setStatus('Версия игры не совпадает');
      clearSession();
      this.closeTransport();
      return;
    }

    let game;

    try {
      game = Game.fromState(message.state);
    } catch {
      this.setStatus('Не удалось получить состояние игры');
      clearSession();
      this.closeTransport();
      return;
    }

    clearTimeout(this.welcomeTimeout);
    this.welcomeTimeout = null;
    this.unsubscribeMessage?.();
    this.unsubscribeMessage = null;

    this.session?.unsubscribeMessage?.();
    this.session?.unsubscribeStatus?.();
    this.session?.listeners?.clear();
    this.session?.statusListeners?.clear();

    const session = new GameSession({
      game,
      role: 'guest',
      transport: this.transport,
      localColor: message.you,
      seq: message.seq,
      code: this.code,
    });

    this.session = session;
    saveSession(session);
    this.handedOff = true;
    this.scene.start('GameScene', {
      session,
      localColor: message.you,
    });
  }

  onGuestStatus(status, detail) {
    if (this.handedOff || this.isShuttingDown || !this.transport) {
      return;
    }

    if (status === 'connecting') {
      if (!this.isResuming) {
        this.setStatus('Подключение к серверу PeerJS...');
      }
      return;
    }

    if (status === 'joining') {
      this.setStatus(
        this.isResuming
          ? `Переподключение к комнате ${detail}...`
          : `Подключение к комнате ${detail}...`
      );
      return;
    }

    if (status === 'error') {
      const type = detail?.type ?? detail?.message;
      this.setStatus(this.describeError(detail));

      if (type === 'protocol-version-mismatch') {
        clearSession();
        this.closeTransport();
        return;
      }

      if (this.joinPending) {
        return;
      }

      if (this.isResuming && this.canRetryJoin(detail)) {
        this.scheduleJoinRetry();
        return;
      }

      this.closeTransport();

      if (this.isResuming) {
        clearSession();
      }
      return;
    }

    if (status === 'disconnected') {
      if (this.transport?.conn?.open) {
        return;
      }

      if (this.joinPending) {
        return;
      }

      if (this.isResuming && this.canRetryJoin(detail)) {
        this.scheduleJoinRetry();
        return;
      }

      this.setStatus('Соединение с хостом закрыто');
      this.closeTransport();

      if (this.isResuming) {
        clearSession();
      }
      return;
    }

    if (status === 'closed') {
      if (detail === 'left') {
        this.setStatus('Хост закрыл комнату');
        clearSession();
        this.closeTransport();
        return;
      }

      if (this.isResuming && this.canRetryJoin(detail)) {
        this.scheduleJoinRetry();
        return;
      }

      this.setStatus(
        detail === 'room-full'
          ? 'Комната уже занята'
          : 'Соединение с хостом закрыто'
      );
      this.closeTransport();

      if (this.isResuming) {
        clearSession();
      }
    }
  }

  closeTransport(reason = null) {
    this.attemptId += 1;
    this.joinPending = false;
    clearTimeout(this.welcomeTimeout);
    this.welcomeTimeout = null;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
    this.unsubscribeMessage?.();
    this.unsubscribeMessage = null;

    if (this.session) {
      this.session.dispose(reason);
      this.session = null;
      this.transport = null;
      return;
    }

    this.transport?.close?.(reason);
    this.transport = null;
  }

  exitToHome() {
    clearSession();
    this.closeTransport('left');
    this.scene.start('HomeScene');
  }

  describeError(error) {
    const type = error?.type ?? error?.message;

    switch (type) {
      case 'peer-unavailable':
        return 'Комната не найдена';
      case 'network':
        return 'Нет связи с сервером PeerJS. Проверь интернет';
      case 'server-error':
        return 'Сервер PeerJS недоступен';
      case 'browser-incompatible':
        return 'Браузер не поддерживает WebRTC';
      case 'unavailable-id':
        return 'Код комнаты занят';
      case 'signaling-timeout':
        return 'Сервер PeerJS не отвечает. Проверь интернет или VPN';
      case 'connection-timeout':
        return 'Не удалось установить P2P-соединение. Попробуйте другую сеть или отключите VPN';
      case 'empty-room-code':
        return 'Введите код комнаты';
      case 'protocol-version-mismatch':
        return 'Версия игры не совпадает';
      case 'welcome-timeout':
        return 'Хост не ответил';
      default:
        return 'Ошибка подключения';
    }
  }
}

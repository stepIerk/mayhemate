import Phaser from 'phaser';

const FONT_FAMILY = '"DotumChe", monospace';

const BORDER_COLOR = 0x318a0b;
const BUTTON_COLOR = 0x35960b;

export default class ButtonView extends Phaser.GameObjects.Container {
  constructor(scene, label, width, height, onClick) {
    super(scene, 0, 0);

    this.onClick = onClick;

    this.shadow = new Phaser.GameObjects.Rectangle(
      scene,
      4,
      4,
      width,
      height,
      0x000000,
      0.65
    );

    this.background = new Phaser.GameObjects.Rectangle(
      scene,
      0,
      0,
      width,
      height,
      BUTTON_COLOR,
      1
    ).setStrokeStyle(3, BORDER_COLOR, 1);


    this.label = new Phaser.GameObjects.Text(
      scene,
      0,
      0,
      label,
      {
        fontFamily: FONT_FAMILY,
        fontSize: `${Math.max(16, Math.round(height * 0.48))}px`,
        color: '#ffd166',
        align: 'center',
        shadow: {
          offsetX: 2,
          offsetY: 2,
          color: '#000000',
          blur: 0,
          fill: true,
        },
      }
    ).setOrigin(0.5);

    this.add([this.shadow, this.background, this.label]);

    this.setSize(width, height);
    scene.add.existing(this);
    this.setInteractive({ useHandCursor: true });

    this.on('pointerover', () => {
      this.background.setFillStyle(BORDER_COLOR);
      this.label.setColor('#ffe39a');
    });

    this.on('pointerout', () => {
      this.background.setFillStyle(BUTTON_COLOR);
      this.label.setColor('#ffd166');
      this.setScale(1);
    });

    this.on('pointerdown', () => {
      this.setScale(0.97);
    });

    this.on('pointerup', () => {
      this.setScale(1);
      this.onClick?.();
    });

    this.on('pointerupoutside', () => {
      this.setScale(1);
    });
  }

  layout(x, y) {
    this.setPosition(x, y);
  }
}

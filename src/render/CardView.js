import Phaser from 'phaser';
import {
  CARD_HEIGHT,
  CARD_LAYOUT,
  CARD_WIDTH,
} from './cardLayout.js';

const FONT_FAMILY = '"DotumChe", monospace';
const LEFT = -CARD_WIDTH / 2;
const TOP = -CARD_HEIGHT;

function addImageFit(container, image, rect) {
  const fit = Math.min(rect.width / image.width, rect.height / image.height);

  image.setScale(fit * 0.88);
  container.add(image);
}

export default class CardView extends Phaser.GameObjects.Container {
  constructor(scene, card, definition, templateKey) {
    super(scene, 0, 0);

    this.isCardView = true;
    this.card = card;
    this.definition = definition;
    this.playable = true;
    this.pressed = false;
    this.hovered = false;
    this.evaporating = false;

    this.homeX = 0;
    this.homeY = 0;
    this.homeRotation = 0;
    this.homeScale = 1;
    this.homeDepth = 200;

    this.setSize(CARD_WIDTH, CARD_HEIGHT);
    this.build(templateKey);

    scene.add.existing(this);
    this.setInteractive(
      new Phaser.Geom.Rectangle(
        0,
        -CARD_HEIGHT / 2,
        CARD_WIDTH,
        CARD_HEIGHT
      ),
      Phaser.Geom.Rectangle.Contains
    );

    this.on('pointerover', () => {
      this.hovered = true;
    });

    this.on('pointerout', () => {
      this.hovered = false;
    });
  }

  build(templateKey) {
    const scene = this.scene;

    if (templateKey && scene.textures.exists(templateKey)) {
      const template = new Phaser.GameObjects.Image(
        scene,
        LEFT,
        TOP,
        templateKey
      ).setOrigin(0);

      template.setDisplaySize(CARD_WIDTH, CARD_HEIGHT);
      this.add(template);
    } else {
      this.add(
        new Phaser.GameObjects.Rectangle(
          scene,
          0,
          -CARD_HEIGHT / 2,
          CARD_WIDTH,
          CARD_HEIGHT,
          0x24140c
        ).setStrokeStyle(3, 0x8a4f1d)
      );
      this.add(
        new Phaser.GameObjects.Rectangle(
          scene,
          0,
          -CARD_HEIGHT / 2,
          CARD_WIDTH - 8,
          CARD_HEIGHT - 8,
          0xefe0bf
        )
      );
    }

    this.buildArt();
    this.buildCost();
    this.buildText();
  }

  buildArt() {
    const scene = this.scene;
    const rect = CARD_LAYOUT.art;
    const centerX = LEFT + rect.x + rect.width / 2;
    const centerY = TOP + rect.y + rect.height / 2;

    if (this.definition.art && scene.textures.exists(this.definition.art)) {
      const image = new Phaser.GameObjects.Image(
        scene,
        centerX,
        centerY,
        this.definition.art
      );

      addImageFit(this, image, rect);
      return;
    }

    this.add(
      new Phaser.GameObjects.Rectangle(
        scene,
        centerX,
        centerY,
        rect.width - 6,
        rect.height - 6,
        0x171a22
      )
    );
    this.add(
      new Phaser.GameObjects.Text(scene, centerX, centerY, '?', {
        fontFamily: FONT_FAMILY,
        fontSize: '32px',
        color: '#8a4f1d',
      }).setOrigin(0.5)
    );
  }

  buildCost() {
    const scene = this.scene;
    const rect = CARD_LAYOUT.cost;

    if (scene.textures.exists('tempo')) {
      const icon = new Phaser.GameObjects.Image(
        scene,
        LEFT + rect.x + 14,
        TOP + rect.y + rect.height / 2,
        'tempo'
      );

      icon.setDisplaySize(16, 16);
      this.add(icon);
    }

    this.add(
      new Phaser.GameObjects.Text(
        scene,
        LEFT + rect.x + rect.width - 18,
        TOP + rect.y + rect.height / 2,
        String(this.definition.cost ?? 0),
        {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          color: '#ffd166',
          shadow: {
            offsetX: 1,
            offsetY: 1,
            color: '#000000',
            blur: 0,
            fill: true,
          },
        }
      ).setOrigin(0.5)
    );
  }

  buildText() {
    const scene = this.scene;
    const nameRect = CARD_LAYOUT.name;
    const name = new Phaser.GameObjects.Text(
      scene,
      0,
      TOP + nameRect.y + nameRect.height / 2,
      this.definition.name,
      {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: '#3a2112',
        align: 'center',
      }
    ).setOrigin(0.5);

    let fontSize = 15;

    while (name.width > nameRect.width - 6 && fontSize > 9) {
      fontSize -= 1;
      name.setFontSize(fontSize);
    }

    this.add(name);

    const descRect = CARD_LAYOUT.description;
    const description = new Phaser.GameObjects.Text(
      scene,
      LEFT + descRect.x,
      TOP + descRect.y,
      this.definition.text,
      {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        color: '#4a2c18',
        align: 'left',
        lineSpacing: 1,
        wordWrap: { width: descRect.width },
      }
    ).setOrigin(0, 0);

    description.setMaxLines(4);
    this.add(description);
  }

  setPlayable(playable) {
    this.playable = Boolean(playable);
    this.setAlpha(this.playable ? 1 : 0.55);

    if (this.scene?.input) {
      this.scene.input.setDraggable(this, this.playable);
    }
  }

  setHome({ x, y, rotation, scale, depth }) {
    this.homeX = x;
    this.homeY = y;
    this.homeRotation = rotation;
    this.homeScale = scale;

    if (typeof depth === 'number') {
      this.homeDepth = depth;
    }
  }

  snapHome() {
    this.setPosition(this.homeX, this.homeY);
    this.setRotation(this.homeRotation);
    this.setScale(this.homeScale);
    this.setDepth(this.homeDepth);
  }
}
